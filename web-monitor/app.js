// /web-monitor/app.js

// --- Configuración ---
const MQTT_BROKER_URL = "ws://localhost:9001";
const CLIENT_ID = `web_monitor_${Math.random().toString(16).slice(2, 8)}`;

const TELEMETRY_TOPIC = "utp/sistemas_distribuidos/grupo1/+/telemetry";
const STATUS_TOPIC = "utp/sistemas_distribuidos/grupo1/+/status";
const MUTEX_STATUS_TOPIC = "utp/sistemas_distribuidos/grupo1/mutex/status"; // <--

// --- Elementos del DOM ---
const connectionStatusEl = document.getElementById("connection-status");
const deviceListEl = document.getElementById("device-list");
const sensorCardsEl = document.getElementById("sensor-cards");
const messageLogEl = document.getElementById("message-log");
const browserTimeEl = document.getElementById("browser-time");
const monitorClockEl = document.getElementById("monitor-clock");
const monitorVectorClockEl = document.getElementById("monitor-vector-clock");
// NUEVOS elementos para Mutex
const resourceStatusLightEl = document.getElementById("resource-status-light");
const resourceStatusTextEl = document.getElementById("resource-status-text");
const resourceHolderEl = document.getElementById("resource-holder");
const resourceQueueEl = document.getElementById("resource-queue");

// --- Estado de la Aplicación ---
let client;
const devices = {}; // Almacenará el estado y datos de cada dispositivo
let lamportClock = 0;
const VECTOR_PROCESS_COUNT_MONITOR = 4;
const PROCESS_ID_MONITOR = 3;
let vectorClock = new Array(VECTOR_PROCESS_COUNT_MONITOR).fill(0);
let lastReceivedVector = null;

// --- Funciones de Logging ---
function logMessage(message) {
  const timestamp = new Date().toLocaleTimeString();
  messageLogEl.innerHTML += `[${timestamp}] ${message}\n`;
  messageLogEl.scrollTop = messageLogEl.scrollHeight;
}

// --- Funciones de Actualización del DOM ---
function updateMonitorClock() {
  monitorClockEl.textContent = `Reloj Logico (Monitor): ${lamportClock}`;
}
function updateMonitorVectorClock() {
  monitorVectorClockEl.textContent = `Reloj Vectorial: [${vectorClock.join(",")}]`;
}
function updateBrowserTime() {
  browserTimeEl.textContent = `Hora Navegador: ${new Date().toLocaleTimeString()}`;
}

function updateConnectionStatus(isConnected, error = null) {
  if (isConnected) {
    connectionStatusEl.textContent = "Estado: Conectado";
    connectionStatusEl.classList.add("connected");
    connectionStatusEl.classList.remove("disconnected");
    logMessage("*** Conectado al Broker MQTT ***");
  } else {
    connectionStatusEl.textContent = `Estado: Desconectado ${error ? `(${error})` : ""}`;
    connectionStatusEl.classList.remove("connected");
    connectionStatusEl.classList.add("disconnected");
    logMessage(
      `*** Desconectado del Broker MQTT ${error ? `- ${error}` : ""} ***`,
    );
  }
}

function updateDeviceStatus(deviceId, status) {
  if (!devices[deviceId]) {
    devices[deviceId] = { status: "desconocido", telemetry: {} };
  }
  devices[deviceId].status = status.toLowerCase();

  let deviceEl = document.getElementById(`device-${deviceId}`);
  if (!deviceEl) {
    deviceEl = document.createElement("div");
    deviceEl.id = `device-${deviceId}`;
    deviceEl.classList.add("device-status-item");
    deviceListEl.appendChild(deviceEl);
  }

  deviceEl.innerHTML = `
        <span class="device-id">${deviceId}</span>
        <span class="status-indicator ${devices[deviceId].status}">${status.toUpperCase()}</span>
    `;
  updateSensorCard(deviceId);
}

// --- Función para actualizar el panel de Mutex ---
function updateMutexStatus(data) {
  logMessage(`[MUTEX] Estado del recurso actualizado: ${JSON.stringify(data)}`);

  if (data.isAvailable) {
    resourceStatusLightEl.classList.remove("busy");
    resourceStatusLightEl.classList.add("available");
    resourceStatusTextEl.textContent = "Libre";
  } else {
    resourceStatusLightEl.classList.remove("available");
    resourceStatusLightEl.classList.add("busy");
    resourceStatusTextEl.textContent = "Ocupado";
  }

  resourceHolderEl.textContent = data.holder || "---";
  resourceQueueEl.textContent =
    data.queue.length > 0 ? data.queue.join(", ") : "---";
}

function updateSensorCard(deviceId) {
  if (!devices[deviceId]) return;

  let cardEl = document.getElementById(`card-${deviceId}`);
  if (!cardEl) {
    cardEl = document.createElement("div");
    cardEl.id = `card-${deviceId}`;
    cardEl.classList.add("sensor-card");
    sensorCardsEl.appendChild(cardEl);
  }

  const deviceData = devices[deviceId];
  const statusClass = deviceData.status === "online" ? "online" : "offline";

  // --- Lógica de Delta y Timestamps ---
  let timeCorregido = "N/A";
  let timeSimulado = "N/A";
  let offset = "N/A";
  let delta = "N/A";
  let deltaClass = "";

  if (deviceData.telemetry.timestamp) {
    const sensorTimeCorrected = new Date(deviceData.telemetry.timestamp);
    const browserTime = new Date();
    timeCorregido = sensorTimeCorrected.toLocaleTimeString("en-GB", {
      hour12: false,
    });

    const deltaSeconds =
      (sensorTimeCorrected.getTime() - browserTime.getTime()) / 1000;
    delta = `${deltaSeconds.toFixed(1)} s`;
    if (deltaSeconds > 1.5) {
      deltaClass = "delta-positive";
    } else if (deltaSeconds < -1.5) {
      deltaClass = "delta-negative";
    }
  }

  if (deviceData.telemetry.timestamp_simulado) {
    timeSimulado = new Date(
      deviceData.telemetry.timestamp_simulado,
    ).toLocaleTimeString("en-GB", { hour12: false });
  }

  if (deviceData.telemetry.clock_offset) {
    offset = `${deviceData.telemetry.clock_offset} ms`;
  }

  const temp =
    deviceData.telemetry.temperatura !== undefined
      ? `${deviceData.telemetry.temperatura} °C`
      : "N/A";
  const hum =
    deviceData.telemetry.humedad !== undefined
      ? `${deviceData.telemetry.humedad} %`
      : "N/A";
  const lamport_ts =
    deviceData.telemetry.lamport_ts !== undefined
      ? deviceData.telemetry.lamport_ts
      : "N/A";
  const vector_clock = deviceData.telemetry.vector_clock
    ? `[${deviceData.telemetry.vector_clock.join(",")}]`
    : "N/A";

  const sensorState = (
    deviceData.telemetry.sensor_state || "IDLE"
  ).toLowerCase();
  const sensorStateText = sensorState.toUpperCase();

  // --- HTML de la Tarjeta Actualizado ---
  cardEl.innerHTML = `
        <h3>${deviceId} <span class="status-indicator ${statusClass}">${deviceData.status.toUpperCase()}</span></h3>
        <p>Temperatura: <strong>${temp}</strong></p>
        <p>Humedad: <strong>${hum}</strong></p>

        <p class="state state-${sensorState}">Estado: <strong>${sensorStateText}</strong></p>

        <p>T. Corregido: <strong>${timeCorregido}</strong></p>
        <p>T. Simulado: <span class="${deltaClass}">${timeSimulado}</span></p>
        <p class="delta ${deltaClass}">Delta (Corregido - Navegador): <strong>${delta}</strong></p>
        <p>Lamport TS (Sensor): <strong>${lamport_ts}</strong></p>
        <p>Vector (Sensor): <strong>${vector_clock}</strong></p>
    `;
  // Nota: Se quitó 'Offset Aplicado' para no saturar la tarjeta.
}

// --- Lógica MQTT ---
function connectToMqtt() {
  logMessage(`Intentando conectar a ${MQTT_BROKER_URL}...`);
  client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: CLIENT_ID,
    clean: true,
    connectTimeout: 4000,
  });

  client.on("connect", () => {
    updateConnectionStatus(true);

    client.subscribe(TELEMETRY_TOPIC, { qos: 0 }, (err) => {
      if (!err) logMessage(`Suscrito a telemetría: ${TELEMETRY_TOPIC}`);
    });

    client.subscribe(STATUS_TOPIC, { qos: 1 }, (err) => {
      if (!err) logMessage(`Suscrito a estado: ${STATUS_TOPIC}`);
    });

    // ---  Suscripción al estado de Mutex ---
    client.subscribe(MUTEX_STATUS_TOPIC, { qos: 1, retain: true }, (err) => {
      if (!err) {
        logMessage(`Suscrito a estado de MUTEX: ${MUTEX_STATUS_TOPIC}`);
      } else {
        logMessage(`Error al suscribirse a MUTEX: ${err}`);
      }
    });
  });

  client.on("message", (topic, message) => {
    // --- REGLA 1 (Lógica): Evento interno ---
    vectorClock[PROCESS_ID_MONITOR]++;
    lamportClock++;

    const messageString = message.toString();
    logMessage(`Mensaje recibido en [${topic}]`);

    try {
      const data = JSON.parse(messageString);

      // Manejar el mensaje de estado de Mutex PRIMERO
      if (topic === MUTEX_STATUS_TOPIC) {
        updateMutexStatus(data);
        updateMonitorClock(); // Actualizamos relojes aunque sea mensaje de mutex
        updateMonitorVectorClock();
        return; // Salir
      }
        // --- REGLA 2 (Filtro): Validación ---
      const deviceId = data.deviceId;
      if (!deviceId) {
        logMessage("Mensaje recibido sin deviceId, ignorando.");
        return;
      }

      // --- REGLA 3 (Lógica): Fusión ---
      const receivedLamportTS = data.lamport_ts || 0;
      lamportClock = Math.max(lamportClock, receivedLamportTS);
      updateMonitorClock();

      const receivedVectorClock = data.vector_clock;
      if (receivedVectorClock && Array.isArray(receivedVectorClock)) {
        while (receivedVectorClock.length < VECTOR_PROCESS_COUNT_MONITOR) {
          receivedVectorClock.push(0);
        }
        for (let i = 0; i < VECTOR_PROCESS_COUNT_MONITOR; i++) {
          vectorClock[i] = Math.max(vectorClock[i], receivedVectorClock[i]);
        }
        updateMonitorVectorClock();
        logMessage(
          `[VECTOR] Fusion: [${receivedVectorClock.join(",")}] -> [${vectorClock.join(",")}]`,
        );
        checkConcurrency(receivedVectorClock);
        lastReceivedVector = receivedVectorClock;
      }

      if (!devices[deviceId]) {
        devices[deviceId] = { status: "desconocido", telemetry: {} };
      }

      if (topic.includes("/status")) {
        updateDeviceStatus(deviceId, data.status);
      } else if (topic.includes("/telemetry")) {
        devices[deviceId].telemetry = data;
        updateSensorCard(deviceId);
        if (
          devices[deviceId].status === "desconocido" ||
          devices[deviceId].status === "offline"
        ) {
          updateDeviceStatus(deviceId, "online");
        }
      }
    } catch (e) {
      logMessage(`Error procesando mensaje JSON: ${e.message}`);
    }
  });

  client.on("error", (err) => {
    updateConnectionStatus(false, err.message);
    logMessage(`Error MQTT: ${err.message}`);
  });
  client.on("close", () => {
    if (connectionStatusEl.textContent !== "Estado: Desconectado") {
      updateConnectionStatus(false);
    }
  });
  client.on("offline", () => {
    updateConnectionStatus(false, "Cliente desconectado");
  });
  client.on("reconnect", () => {
    logMessage("Intentando reconectar...");
  });
}

// --- Funciones de Comparación (sin cambios) ---
function compareVectorClocks(vA, vB) {
  let a_lt_b = false;
  let b_lt_a = false;
  for (let i = 0; i < vA.length; i++) {
    if (vA[i] < vB[i]) {
      a_lt_b = true;
    } else if (vA[i] > vB[i]) {
      b_lt_a = true;
    }
  }
  if (a_lt_b && !b_lt_a) return "A_BEFORE_B";
  if (b_lt_a && !a_lt_b) return "B_BEFORE_A";
  return "CONCURRENT";
}

function checkConcurrency(newVector) {
  if (lastReceivedVector) {
    const relation = compareVectorClocks(lastReceivedVector, newVector);
    if (relation === "CONCURRENT") {
      logMessage(
        `[CONCURRENCIA] Evento [${newVector.join(",")}] es CONCURRENTE con [${lastReceivedVector.join(",")}]`,
      );
    } else {
      logMessage(
        `[ORDEN] Evento [${lastReceivedVector.join(",")}] sucedió ${relation.replace("_", " ")} [${newVector.join(",")}]`,
      );
    }
  } else {
    logMessage(`[VECTOR] Primer evento recibido [${newVector.join(",")}]`);
  }
}

// --- Iniciar Conexión y Relojes ---
connectToMqtt();
updateBrowserTime();
setInterval(updateBrowserTime, 1000);
updateMonitorClock();
updateMonitorVectorClock();
