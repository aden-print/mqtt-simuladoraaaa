// /subscriber/broadcast.js

const mqtt = require('mqtt');
const config = require('../config');

const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const client = mqtt.connect(brokerUrl);

const topic = `${config.topics.base}/#`; // El tópico "catch-all"

client.on('connect', () => {
  console.log(`[INFO] Suscriptor BROADCAST conectado al broker en ${brokerUrl}`);
  
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (!err) {
      console.log(`[INFO] Suscrito exitosamente al tópico universal: ${topic}`);
    } else {
      console.error(`[ERROR] Error al suscribirse:`, err);
    }
  });
});

client.on('message', (receivedTopic, message) => {
  console.log(`\n[MSG] Mensaje recibido en el tópico [${receivedTopic}]`);

  try {
    const data = JSON.parse(message.toString());

    // --- Lógica de Procesamiento Inteligente (MEJORADA) ---
    if (receivedTopic.endsWith('/telemetry')) {
      console.log('      > Datos de Telemetría:');
      console.log(`        - Dispositivo: ${data.deviceId}`);
      console.log(`        - Estado: ${data.sensor_state}`);
    
    } else if (receivedTopic.includes('/status') && data.deviceId) {
      // Es un mensaje de ESTADO DE DISPOSITIVO
      const status = data.status ? data.status.toUpperCase() : 'DESCONOCIDO';
      console.log(`      > Notificación de Estado (Dispositivo): El dispositivo ${data.deviceId} está ${status}`);
    
    } else if (receivedTopic.includes('/status') && data.isAvailable !== undefined) {
      // Es un mensaje de ESTADO DE MUTEX
      console.log('      > Notificación de Estado (Recurso):');
      console.log(`        - Disponible: ${data.isAvailable}`);
      console.log(`        - Propietario: ${data.holder || '---'}`);
      console.log(`        - Cola: [${data.queue.join(', ')}]`);

    } else if (receivedTopic.includes('/time/request')) {
        console.log(`      > Solicitud de Tiempo: de ${data.deviceId}`);
    } else if (receivedTopic.includes('/time/response')) {
        console.log(`      > Respuesta de Tiempo: para ${receivedTopic.split('/').pop()}`);

    } else if (receivedTopic.includes('/mutex/request')) {
        console.log(`      > Solicitud de Recurso: de ${data.deviceId}`);
    } else if (receivedTopic.includes('/mutex/release')) {
        console.log(`      > Liberación de Recurso: de ${data.deviceId}`);
    } else if (receivedTopic.includes('/mutex/grant')) {
        console.log(`      > Permiso de Recurso: para ${receivedTopic.split('/').pop()}`);
    
    } else {
      console.log('      > Datos (tipo no reconocido):', data);
    }
  } catch (error) {
    console.error('[ERROR] Mensaje no es un JSON válido:', message.toString());
  }
});

client.on('error', (error) => {
  console.error('[ERROR] Error de conexión:', error);
  client.end();
});