  // /time-server/time-server.js

  const mqtt = require('mqtt');
  const config = require('../config');

  const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
  const clientId = 'time_server_01';

  const client = mqtt.connect(brokerUrl, { clientId });

  const requestTopic = config.topics.time_request;

  client.on('connect', () => {
    console.log(`[INFO] Servidor de Tiempo conectado a ${brokerUrl}`);
    
    client.subscribe(requestTopic, { qos: 0 }, (err) => {
      if (!err) {
        console.log(`[INFO] Escuchando solicitudes de tiempo en [${requestTopic}]`);
      } else {
        console.error('[ERROR] Error al suscribirse:', err);
      }
    });
  });

  client.on('message', (topic, message) => {
    if (topic === requestTopic) {
      try {
        const request = JSON.parse(message.toString());
        const deviceId = request.deviceId;
        
        if (!deviceId) {
          console.warn('[WARN] Solicitud de tiempo sin deviceId:', message.toString());
          return;
        }

        const serverTime = Date.now();
        const responseTopic = config.topics.time_response(deviceId);
        
        const responsePayload = JSON.stringify({
          serverTime: serverTime
        });

        client.publish(responseTopic, responsePayload, { qos: 0 }, () => {
          console.log(`[TIME] Respondiendo a ${deviceId} con hora ${serverTime}`);
        });
  
      } catch (e) {
        console.error('[ERROR] Error procesando solicitud de tiempo:', e.message);
      }
    }
  });

  client.on('error', (error) => {
    console.error('[ERROR] Error de conexión MQTT:', error);
  });