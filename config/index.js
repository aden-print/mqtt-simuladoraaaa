// /config/index.js

/**
 * Archivo central de configuración para la aplicación MQTT.
 * Aquí se definen las direcciones del broker y la estructura de los tópicos.
 */
module.exports = {
  // Configuración del Broker MQTT
  broker: {
    address: 'mqtt-broker',
    port: 1883,
  },

  // Definición de los Tópicos
  topics: {
    // Tópico base para todos los mensajes del proyecto
    base: 'utp/sistemas_distribuidos/grupo1',

    // Tópico para datos de telemetría de un dispositivo específico
    telemetry: (deviceId) => `utp/sistemas_distribuidos/grupo1/${deviceId}/telemetry`,

    // Tópico para el estado de un dispositivo (online/offline)
    status: (deviceId) => `utp/sistemas_distribuidos/grupo1/${deviceId}/status`,

    // --- Tópicos para Sincronización de Reloj (Cristian) ---
    /** Tópico general donde los clientes solicitan la hora */
    time_request: 'utp/sistemas_distribuidos/grupo1/time/request',

    /** Tópico base para las respuestas del servidor de tiempo. */
    time_response: (deviceId) => `utp/sistemas_distribuidos/grupo1/time/response/${deviceId}`,

    // --- TÓPICOS PARA EXCLUSIÓN MUTUA ---
    /** Tópico para solicitar el acceso al recurso (publisher -> coordinator) */
    mutex_request: 'utp/sistemas_distribuidos/grupo1/mutex/request',

    /** Tópico para liberar el recurso (publisher -> coordinator) */
    mutex_release: 'utp/sistemas_distribuidos/grupo1/mutex/release',

    /** Tópico para otorgar el permiso (coordinator -> publisher) */
    mutex_grant: (deviceId) => `utp/sistemas_distribuidos/grupo1/mutex/grant/${deviceId}`,

    /** Tópico para que el coordinador publique el estado actual del recurso (coordinator -> web-monitor) */
    mutex_status: 'utp/sistemas_distribuidos/grupo1/mutex/status',

    // --- NUEVOS TÓPICOS PARA ELECCIÓN DE LÍDER ---
    election: {
      /** Tópico para mensajes de heartbeat (PING/PONG) */
      heartbeat: 'utp/sistemas_distribuidos/grupo1/election/heartbeat',

      /** Tópico para mensajes del algoritmo de elección (ELECTION, ALIVE) */
      messages: 'utp/sistemas_distribuidos/grupo1/election/messages',

      /** Tópico para anunciar al nuevo coordinador (VICTORY). Es un mensaje retenido. */
      coordinator: 'utp/sistemas_distribuidos/grupo1/election/coordinator',
    }
  },
};