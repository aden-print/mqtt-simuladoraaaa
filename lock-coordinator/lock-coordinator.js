// /lock-coordinator/lock-coordinator.js

const mqtt = require('mqtt');
const config = require('../config');

// --- Configuración de Elección ---
const MY_PRIORITY = parseInt(process.env.PROCESS_PRIORITY || '10');
const DEVICE_ID = 'lock-coordinator'; // ID fijo para este servicio

// --- Estado del Recurso Compartido ---
let isLockAvailable = true;
let lockHolder = null;
const waitingQueue = [];

const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const client = mqtt.connect(brokerUrl, {
  clientId: `lock_coordinator_${Math.random().toString(16).slice(2, 8)}`
});

client.on('connect', () => {
  console.log(`[INFO] Coordinador de Bloqueo (Prioridad ${MY_PRIORITY}) conectado.`);

  client.subscribe(config.topics.mutex_request, { qos: 1 }, (err) => {
    if (!err) console.log(`[INFO] Escuchando solicitudes en [${config.topics.mutex_request}]`);
  });

  client.subscribe(config.topics.mutex_release, { qos: 1 }, (err) => {
    if (!err) console.log(`[INFO] Escuchando liberaciones en [${config.topics.mutex_release}]`);
  });


  // 2. Suscripciones de Elección (Mantenimiento del liderazgo)
  client.subscribe(config.topics.election.heartbeat, { qos: 0 });
  client.subscribe(config.topics.election.messages, { qos: 1 });

  // 3. Anunciar liderazgo inmediatamente al iniciar (Retained message)
  announceCoordinator();

  // Publicar estado inicial del recurso
  publishStatus();
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    // --- LÓGICA DE ELECCIÓN (Bully) ---
    // A. Alguien pregunta "¿Estás vivo?"
    if (topic === config.topics.election.heartbeat) {
      if (payload.type === 'PING') {
        // Respondemos PONG para decir "Sí, sigo aquí, no inicien elecciones"
        // (Opcional: Podríamos responder solo si el PING busca a alguien de nuestra prioridad o superior)
        client.publish(config.topics.election.heartbeat, JSON.stringify({
          type: 'PONG',
          fromPriority: MY_PRIORITY
        }));
      }
      return;
    }

    // B. Alguien intentó iniciar una elección
    if (topic === config.topics.election.messages) {
      if (payload.type === 'ELECTION') {
        const senderPriority = payload.fromPriority;
        // Si somos mayores que el que convoca la elección...
        if (MY_PRIORITY > senderPriority) {
          console.log(`[BULLY] Elección recibida de menor rango (${senderPriority}). Enviando ALIVE.`);
          // Le respondemos "ALIVE" para detener su intento de autoproclamarse
          client.publish(config.topics.election.messages, JSON.stringify({
            type: 'ALIVE',
            toPriority: senderPriority,
            fromPriority: MY_PRIORITY
          }));
          // Y reafirmamos nuestra autoridad
          announceCoordinator();
        }
      }
      return;
    }

    // C. Alguien responde "ALIVE"
    if (topic === config.topics.election.messages) {
      if (payload.type === 'ALIVE') {
        const senderPriority = payload.fromPriority;
        // Si somos menores que el que responde...
        if (MY_PRIORITY < senderPriority) {
          console.log(`[BULLY] Recibido ALIVE de mayor rango (${senderPriority}). Cambiando liderazgo.`);
          // Cambiamos nuestro estado a "NO_LEADER"
          isLeader = false;
          // Y reafirmamos nuestra autoridad
          announceCoordinator();
        }
      }
      return;
    }

    // --- LÓGICA DE MUTEX (Normal) ---

    //   const data = JSON.parse(message.toString());
    //   const deviceId = data.deviceId;

    //   if (!deviceId) return;

    //   if (topic === config.topics.mutex_request) {
    //     handleRequest(deviceId);
    //   } else if (topic === config.topics.mutex_release) {
    //     handleRelease(deviceId);
    //   }

    // } catch (e) {
    //   console.error('[ERROR] Mensaje JSON inválido:', e.message);
    // }

    const deviceId = payload.deviceId;
    if (!deviceId) return;

    if (topic === config.topics.mutex_request) {
      handleRequest(deviceId);
    } else if (topic === config.topics.mutex_release) {
      handleRelease(deviceId);
    }

  } catch (e) {
    console.error('[ERROR] Mensaje inválido:', e.message);
  }

});

// --- Funciones de Elección ---
function announceCoordinator() {
  console.log(`[BULLY] Anunciando Liderazgo (Prioridad ${MY_PRIORITY})`);
  const msg = JSON.stringify({
    type: 'VICTORY',
    coordinatorId: DEVICE_ID,
    priority: MY_PRIORITY
  });
  // Enviamos con RETAIN para que cualquiera que entre sepa quién manda
  client.publish(config.topics.election.coordinator, msg, { qos: 1, retain: true });
}

// --- Funciones de Mutex
function handleRequest(deviceId) {
  console.log(`[REQUEST] Solicitud recibida de: ${deviceId}`);

  if (isLockAvailable) {
    grantLock(deviceId);
  } else {
    if (!waitingQueue.includes(deviceId) && lockHolder !== deviceId) {
      console.log(`[QUEUE] ${deviceId} añadido a la cola de espera.`);
      waitingQueue.push(deviceId);
    }
  }
  publishStatus();
}

function handleRelease(deviceId) {
  if (lockHolder === deviceId) {
    console.log(`[RELEASE] Recurso liberado por: ${deviceId}`);
    lockHolder = null;
    isLockAvailable = true;

    if (waitingQueue.length > 0) {
      const nextDeviceId = waitingQueue.shift();
      console.log(`[GRANT] Otorgando recurso al siguiente en la cola: ${nextDeviceId}`);
      grantLock(nextDeviceId);
    }
  } else {
    console.warn(`[WARN] ${deviceId} intentó liberar un recurso que no posee.`);
  }
  publishStatus();
}

function grantLock(deviceId) {
  isLockAvailable = false;
  lockHolder = deviceId;

  const grantTopic = config.topics.mutex_grant(deviceId);
  console.log(`[GRANT] Otorgando recurso a ${deviceId} en [${grantTopic}]`);

  client.publish(grantTopic, JSON.stringify({ status: 'granted' }), { qos: 1 });
}

function publishStatus() {
  const statusPayload = JSON.stringify({
    isAvailable: isLockAvailable,
    holder: lockHolder,
    queue: waitingQueue
  });

  console.log('[STATUS] Publicando estado:', statusPayload);
  client.publish(config.topics.mutex_status, statusPayload, { qos: 0, retain: true });
}

client.on('error', (error) => {
  console.error('[ERROR] Error de conexión MQTT:', error);
});