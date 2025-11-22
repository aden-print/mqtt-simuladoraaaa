// /publisher/publisher.js

const mqtt = require('mqtt');
const fs = require('fs'); 
const config = require('../config');

// --- Configuración Básica ---
const CLOCK_DRIFT_RATE = parseFloat(process.env.CLOCK_DRIFT_RATE || '0');
const DEVICE_ID = process.env.DEVICE_ID || 'sensor-default';
const PROCESS_ID = parseInt(process.env.PROCESS_ID || '0');

// --- Configuración de Elección (Bully) ---
const MY_PRIORITY = parseInt(process.env.PROCESS_PRIORITY || '0');
let currentLeaderPriority = 100; // Asumimos que hay alguien superior al inicio
let isCoordinator = false;
let electionInProgress = false;
let lastHeartbeatTime = Date.now();
const HEARTBEAT_INTERVAL = 2000; // Enviar PING cada 2s
// const LEADER_TIMEOUT = 5000; // 
const ELECTION_TIMEOUT = 3000;   // Tiempo espera respuestas ALIVE

// --- NUEVO EXAMEN FASE 2: Consenso y Leases ---
const LEASE_TOPIC = 'election/lease';
const LEADER_TIMEOUT = 5000; // Regla del Asesino Silencioso
let lastLeaseSeen = Date.now();

// --- Estado Mutex (Cliente) ---
let sensorState = 'IDLE';
const CALIBRATION_INTERVAL_MS = 20000 + (Math.random() * 5000);
const CALIBRATION_DURATION_MS = 5000;

// --- Estado Mutex (Servidor/Coordinador) - SOLO SE USA SI isCoordinator = true ---
let coord_isLockAvailable = true;
let coord_lockHolder = null;
let coord_waitingQueue = [];

// --- Sincronización Reloj (Cristian, Lamport, Vector) ---
// ... (Variables reducidas para brevedad, la lógica se mantiene)
// --- NUEVO EXAMEN FASE 1: Variable para medir RTT ---
let timeRequestStart = 0; 

let lastRealTime = Date.now();
let lastSimulatedTime = Date.now();
let clockOffset = 0;
let lamportClock = 0;
const VECTOR_PROCESS_COUNT = 5; 
let vectorClock = new Array(VECTOR_PROCESS_COUNT).fill(0);

// --- Conexión MQTT ---
const statusTopic = config.topics.status(DEVICE_ID);
const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const client = mqtt.connect(brokerUrl, {
  clientId: `pub_${DEVICE_ID}_${Math.random().toString(16).slice(2, 5)}`,
  will: { topic: statusTopic, payload: JSON.stringify({ deviceId: DEVICE_ID, status: 'offline' }), qos: 1, retain: true }
});

// ============================================================================
//                            LÓGICA DEL CICLO DE VIDA
// ============================================================================

client.on('connect', () => {
  console.log(`[INFO] ${DEVICE_ID} (Prio: ${MY_PRIORITY}) conectado.`);

  // 1. Suscripciones Básicas
  client.subscribe(config.topics.time_response(DEVICE_ID));
  client.subscribe(config.topics.mutex_grant(DEVICE_ID));

  // 2. Suscripciones de Elección
  client.subscribe(config.topics.election.heartbeat); // Escuchar PONG
  client.subscribe(config.topics.election.messages);  // Escuchar ELECTION, ALIVE
  client.subscribe(config.topics.election.coordinator); // Escuchar VICTORY
  
 
  client.subscribe(LEASE_TOPIC);

  // 3. Iniciar Ciclos
  // A. Telemetría
  setInterval(publishTelemetry, 5000);
  // B. Sincronización Reloj (Cristian)
  setInterval(syncClock, 10000);
  setTimeout(() => { setInterval(requestCalibration, CALIBRATION_INTERVAL_MS); }, 5000);

  // D. Monitoreo del Líder (Heartbeat Check)
  setInterval(checkLeaderStatus, 1000);

  // E. Enviar Heartbeats (PING) / --- NUEVO FASE 2: Renovar Lease ---
  setInterval(() => {
      sendHeartbeat();
      renewLease(); // Función nueva para Fase 2
  }, HEARTBEAT_INTERVAL);

  // Publicar estado online
  client.publish(statusTopic, JSON.stringify({ deviceId: DEVICE_ID, status: 'online' }), { retain: true });
});

client.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString());

 
  if (topic === LEASE_TOPIC) {
      const leaderId = payload.leaderId;
      lastLeaseSeen = Date.now(); // He visto al líder vivo
      
      // Si yo creo que soy líder, pero veo un lease de OTRO -> Renuncio
      if (isCoordinator && leaderId !== DEVICE_ID) {
          console.warn(`[SPLIT-BRAIN] Detectado otro líder (${leaderId}). Renunciando.`);
          isCoordinator = false;
          // Dejar de escuchar peticiones de mutex
          client.unsubscribe(config.topics.mutex_request);
          client.unsubscribe(config.topics.mutex_release);
      }
      return;
  }

  // --- 1. MANEJO DE ELECCIÓN (Bully) ---
  if (topic.startsWith('utp/sistemas_distribuidos/grupo1/election')) {
    handleElectionMessages(topic, payload);
    return;
  }

  // --- 2. SI SOY COORDINADOR: MANEJAR SOLICITUDES MUTEX ---
  if (isCoordinator) {
    if (topic === config.topics.mutex_request) {
      handleCoordRequest(payload.deviceId);
      return;
    }
    if (topic === config.topics.mutex_release) {
      handleCoordRelease(payload.deviceId);
      return;
    }
  }

  // --- 3. SI SOY CLIENTE: MANEJAR RESPUESTAS ---
  if (topic === config.topics.mutex_grant(DEVICE_ID)) {
    if (sensorState === 'REQUESTING') {
      console.log(`[MUTEX-CLIENT] Permiso recibido.`);
      sensorState = 'CALIBRATING';
      enterCriticalSection();
    }
  }

  // --- 4. SINCRONIZACIÓN DE RELOJ (CRISTIAN) ---
  if (topic === config.topics.time_response(DEVICE_ID)) {
    // --- NUEVO EXAMEN FASE 1: Cálculo de RTT y descarte ---
    const now = Date.now();
    const rtt = now - timeRequestStart; // Usar variable global
    
    if (rtt > 500) {
        console.warn(`[CRISTIAN] RTT excesivo (${rtt}ms). Sincronización descartada.`);
        return; // No ajustamos el reloj
    }

    // const rtt = Date.now() - (payload.t1 || Date.now()); // --- COMENTADO: Usamos cálculo preciso arriba ---
    const correctTime = payload.serverTime + (rtt / 2);
    clockOffset = correctTime - getSimulatedTime().getTime();
    console.log(`[CRISTIAN] Sincronizado. RTT: ${rtt}ms, Offset: ${clockOffset}`);
  }
});

// ============================================================================
//                          ALGORITMO DE ELECCIÓN (BULLY)
// ============================================================================

function sendHeartbeat() {
  // Solo enviamos PING si NO somos el coordinador
  if (!isCoordinator) {
    client.publish(config.topics.election.heartbeat, JSON.stringify({ type: 'PING', fromPriority: MY_PRIORITY }));
  }
}


function renewLease() {
    if (isCoordinator) {
        client.publish(LEASE_TOPIC, JSON.stringify({ leaderId: DEVICE_ID }), { retain: true });
    }
}

function checkLeaderStatus() {
  if (isCoordinator) return; // Si soy líder, no monitoreo a nadie

  // --- MODIFICADO EXAMEN FASE 2: Usar Lease en vez de Heartbeat simple ---
  // Si pasó mucho tiempo desde el último Lease (5s)
  if (Date.now() - lastLeaseSeen > LEADER_TIMEOUT) {
    console.warn(`[CONSENSUS] Lease expirado (>5s). Iniciando elección.`);
    startElection();
    lastLeaseSeen = Date.now(); // Reset para no spammear
  }
}

function startElection() {
  if (electionInProgress) return;
  electionInProgress = true;
  // lastHeartbeatTime = Date.now(); // --- COMENTADO: Usamos lastLeaseSeen ---

  console.log(`[BULLY] Convocando elección... Buscando nodos con prioridad > ${MY_PRIORITY}`);

  // 1. Enviar mensaje ELECTION a todos los nodos con prioridad superior
  client.publish(config.topics.election.messages, JSON.stringify({
    type: 'ELECTION',
    fromPriority: MY_PRIORITY,
    candidateId: DEVICE_ID // Agregado ID para logs
  }));

  // 2. Esperar respuesta (ALIVE)
  setTimeout(() => {
    if (electionInProgress) {
      // Si llegamos aquí y electionInProgress sigue true, es que NADIE respondió ALIVE.
      // ¡Significa que somos el nodo vivo con mayor prioridad!
      declareVictory();
    }
  }, ELECTION_TIMEOUT);
}

function handleElectionMessages(topic, payload) {
  // A. HEARTBEATS (Ignoramos PONG en Fase 2, usamos Leases, pero dejamos lógica legacy)
  if (topic === config.topics.election.heartbeat) {
    if (payload.type === 'PONG' && payload.fromPriority > MY_PRIORITY) {
      // El líder respondió, todo está bien.
      // lastHeartbeatTime = Date.now(); // --- COMENTADO: Usamos Leases ---
    }
    return;
  }

  // B. MENSAJES DE ELECCIÓN
  if (topic === config.topics.election.messages) {
    // Si alguien con MENOR prioridad inicia elección, le decimos que estamos vivos
    if (payload.type === 'ELECTION' && payload.fromPriority < MY_PRIORITY) {
      console.log(`[BULLY] Recibida elección de inferior (${payload.fromPriority}). Enviando ALIVE.`);
      client.publish(config.topics.election.messages, JSON.stringify({
        type: 'ALIVE', toPriority: payload.fromPriority, fromPriority: MY_PRIORITY
      }));
      // E iniciamos nuestra propia elección por si acaso el líder real murió
      startElection();
    }
    // Si recibimos ALIVE de alguien SUPERIOR, nos callamos y esperamos
    else if (payload.type === 'ALIVE' && payload.fromPriority > MY_PRIORITY) {
      console.log(`[BULLY] Recibido ALIVE de superior (${payload.fromPriority}). Me retiro.`);
      electionInProgress = false; // Dejamos de intentar ser líderes
    }
    return;
  }

  // C. ANUNCIO DE COORDINADOR (VICTORY)
  if (topic === config.topics.election.coordinator) {
    console.log(`[BULLY] Nuevo Coordinador electo: ${payload.coordinatorId} (Prio: ${payload.priority})`);
    currentLeaderPriority = payload.priority;
    lastLeaseSeen = Date.now(); // --- MODIFICADO: Confío en el nuevo líder ---
    electionInProgress = false;

    // Chequear si soy yo (por si acaso)
    if (payload.priority === MY_PRIORITY) { // Ojo: payload.coordinatorId === DEVICE_ID es más seguro
      becomeCoordinator();
    } else {
      isCoordinator = false;
      // Dejar de escuchar peticiones de mutex si antes era coordinador
      client.unsubscribe(config.topics.mutex_request);
      client.unsubscribe(config.topics.mutex_release);
    }
  }
}

function declareVictory() {
  console.log(`[BULLY] ¡Nadie superior respondió! ME DECLARO COORDINADOR.`);
  const msg = JSON.stringify({ type: 'VICTORY', coordinatorId: DEVICE_ID, priority: MY_PRIORITY });
  client.publish(config.topics.election.coordinator, msg, { retain: true });
  becomeCoordinator();
}

function becomeCoordinator() {
  if (isCoordinator) return;
  

  recoverFromWAL();
  
  isCoordinator = true;
  electionInProgress = false;
  console.log(`[ROLE] *** ASCENDIDO A COORDINADOR DE BLOQUEO ***`);

  // Reiniciar estado del mutex (para evitar bloqueos heredados) - 
  // NOTA: recoverFromWAL ya maneja la cola, así que no la borramos aquí si ya recuperamos.
  coord_isLockAvailable = true;
  coord_lockHolder = null;
  // coord_waitingQueue = []; // --- COMENTADO: No borrar, WAL la recuperó ---

  // Suscribirse a los tópicos que debe escuchar el líder
  client.subscribe(config.topics.mutex_request, { qos: 1 });
  client.subscribe(config.topics.mutex_release, { qos: 1 });

  // Publicar estado inicial
  publishCoordStatus();
}

// ============================================================================
//                  LÓGICA DE SERVIDOR MUTEX (Solo si isCoordinator)
// ============================================================================


function appendToWAL(operation, id) {
    const entry = JSON.stringify({ op: operation, id: id, ts: Date.now() }) + '\n';
    try {
        fs.appendFileSync('wal.log', entry);
    } catch (e) {
        console.error("[WAL] Error escribiendo en disco:", e);
    }
}

function recoverFromWAL() {
    if (fs.existsSync('wal.log')) {
        try {
            const data = fs.readFileSync('wal.log', 'utf-8');
            const lines = data.split('\n');
            
            coord_waitingQueue = []; // Limpiar memoria antes de recuperar
            console.log(`[WAL] Replaying events from disk...`);
            
            lines.forEach(line => {
                if (!line.trim()) return;
                try {
                    const entry = JSON.parse(line);
                    if (entry.op === 'ENQUEUE') {
                        if (!coord_waitingQueue.includes(entry.id)) coord_waitingQueue.push(entry.id);
                    }
                    else if (entry.op === 'DEQUEUE') {
                        // Simulación simple: sacar el primero si coincide o buscarlo
                        if (coord_waitingQueue.length > 0) coord_waitingQueue.shift();
                    }
                } catch (e) { }
            });
            console.log(`[RECOVERY] Restored queue: [${coord_waitingQueue.join(', ')}]`);
        } catch (e) {
            console.error("[WAL] Error recuperando:", e);
        }
    }
}
// ---------------------------------------------------------

function handleCoordRequest(requesterId) {
  console.log(`[COORD] Procesando solicitud de: ${requesterId}`);
  if (coord_isLockAvailable) {
    grantCoordLock(requesterId);
  } else {
    if (!coord_waitingQueue.includes(requesterId) && coord_lockHolder !== requesterId) {
      appendToWAL('ENQUEUE', requesterId);
      coord_waitingQueue.push(requesterId);
      console.log(`[COORD] ${requesterId} encolado. (WAL guardado)`);
    }
  }
  publishCoordStatus();
}

function handleCoordRelease(requesterId) {
  if (coord_lockHolder === requesterId) {
    console.log(`[COORD] Liberado por: ${requesterId}`);
    coord_lockHolder = null;
    coord_isLockAvailable = true;
    if (coord_waitingQueue.length > 0) {
      const nextDeviceId = coord_waitingQueue.shift();
      appendToWAL('DEQUEUE', nextDeviceId);
      grantCoordLock(nextDeviceId);
    }
  }
  publishCoordStatus();
}

function grantCoordLock(requesterId) {
  coord_isLockAvailable = false;
  coord_lockHolder = requesterId;
  client.publish(config.topics.mutex_grant(requesterId), JSON.stringify({ status: 'granted' }), { qos: 1 });
}

function publishCoordStatus() {
  client.publish(config.topics.mutex_status, JSON.stringify({
    isAvailable: coord_isLockAvailable,
    holder: coord_lockHolder,
    queue: coord_waitingQueue
  }), { retain: true });
}

// ============================================================================
//                            FUNCIONES AUXILIARES
// ============================================================================

function getSimulatedTime() {
  const now = Date.now();
  const realElapsed = now - lastRealTime;
  const simulatedElapsed = realElapsed + (realElapsed * CLOCK_DRIFT_RATE / 1000);
  lastSimulatedTime = lastSimulatedTime + simulatedElapsed;
  lastRealTime = now;
  return new Date(Math.floor(lastSimulatedTime));
}

function syncClock() {
  // const payload = JSON.stringify({ deviceId: DEVICE_ID, t1: Date.now() }); // --- ORIGINAL ---
  timeRequestStart = Date.now();
  const payload = JSON.stringify({ deviceId: DEVICE_ID });
  
  client.publish(config.topics.time_request, payload, { qos: 0 });
}

function requestCalibration() {
  if (sensorState === 'IDLE' && !isCoordinator) { // El coordinador no se auto-solicita en este ejemplo simple
    console.log(`[MUTEX-CLIENT] Solicitando...`);
    sensorState = 'REQUESTING';
    client.publish(config.topics.mutex_request, JSON.stringify({ deviceId: DEVICE_ID }), { qos: 1 });
  }
}

function enterCriticalSection() {
  setTimeout(() => {
    console.log(`[MUTEX-CLIENT] Fin calibración.`);
    releaseLock();
  }, CALIBRATION_DURATION_MS);
}

function releaseLock() {
  sensorState = 'IDLE';
  client.publish(config.topics.mutex_release, JSON.stringify({ deviceId: DEVICE_ID }), { qos: 1 });
}

function publishTelemetry() {
  lamportClock++;
  // vectorClock[PROCESS_ID]++; // --- COMENTADO: Simplificado para que no falle si PROCESS_ID cambia ---
  const correctedTime = new Date(getSimulatedTime().getTime() + clockOffset);

  const telemetryData = {
    deviceId: DEVICE_ID,
    temperatura: (Math.random() * 30).toFixed(2),
    humedad: (Math.random() * 100).toFixed(2),
    timestamp: correctedTime.toISOString(),
    timestamp_simulado: getSimulatedTime().toISOString(),
    clock_offset: clockOffset.toFixed(0),
    lamport_ts: lamportClock,
    vector_clock: [...vectorClock],
    sensor_state: isCoordinator ? 'COORDINATOR' : sensorState // Mostrar rol especial si es líder
  };
  client.publish(config.topics.telemetry(DEVICE_ID), JSON.stringify(telemetryData));
}