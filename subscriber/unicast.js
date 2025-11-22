/*const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://broker.hivemq.com");

client.on("connect", () => {
  client.subscribe("sistema/unicast/usuarioA", { qos: 1 });
  console.log("Usuario A esperando mensaje unicast...");
});

client.on("message", (topic, message) => {
  console.log(`[UNICAST] Mensaje en ${topic}: ${message.toString()}`);
});
*/

// /subscriber/unicast.js

const mqtt = require('mqtt');
const config = require('../config'); // Importamos la configuración

// ID del dispositivo específico que queremos escuchar
//const DEVICE_ID = 'sensor-001';
// --- CAMBIO: Leer DEVICE_ID desde variable de entorno ---
// Si no se especifica, escuchará a 'sensor-default'
const DEVICE_ID = process.env.DEVICE_ID || 'sensor-default';

// Construimos la URL del broker
const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;

//const client = mqtt.connect(brokerUrl);
// --- OPCIONAL pero RECOMENDADO: clientId único también para suscriptores ---
const options = {
  clientId: `unicast_${DEVICE_ID}_${Math.random().toString(16).slice(2, 8)}`
};
const client = mqtt.connect(brokerUrl, options);

// Definimos el tópico UNICAST usando la misma lógica que el publisher
// El tópico se genera usando el DEVICE_ID leído
const topic = config.topics.telemetry(DEVICE_ID);

// Evento de conexión
client.on('connect', () => {
  //console.log(` Suscriptor conectado al broker en ${brokerUrl}`);
  // --- Usamos `` para incluir el DEVICE_ID en los logs ---
  console.log(`[INFO] Suscriptor UNICAST (${DEVICE_ID}) conectado a ${brokerUrl}`);
  
  // Nos suscribimos al tópico específico
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (!err) {
      console.log(`[INFO] Suscrito exitosamente al tópico [${topic}] con QoS 1`);
    } else {
      console.error(`[ERROR] Error al suscribirse:`, err);
    }
  });
});

// Evento que se dispara cada vez que llega un mensaje
client.on('message', (receivedTopic, message) => {
  console.log(`\n [MSG] Mensaje UNICAST recibido en en el tópico [${receivedTopic}]`);

  try {
    // El mensaje llega como un Buffer, lo convertimos a string
    const messageString = message.toString();
    
    // Parseamos la cadena JSON para convertirla de nuevo en un objeto
    const data = JSON.parse(messageString);

    console.log(' Datos decodificados:');
    console.log(`   - Dispositivo: ${data.deviceId}`);
    console.log(`   - Temperatura: ${data.temperatura}°C`);
    console.log(`   - Humedad: ${data.humedad}%`);
    console.log(`   - Timestamp: ${data.timestamp}`);
    
  } catch (error) {
    console.error(' [ERROR] No se pudo decodificar el mensaje (JSON no válido):', message.toString());
  }
});

// Evento de error
client.on('error', (error) => {
  console.error(`[ERROR] ${DEVICE_ID} - Error de conexión:`, error);
  client.end();
});