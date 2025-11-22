  /*const mqtt = require("mqtt");
  const client = mqtt.connect("mqtt://broker.hivemq.com");

  client.on("connect", () => {
    client.subscribe("sistema/multicast/zonaNorte", { qos: 1 });
    console.log("Nodo Zona Norte esperando multicast...");
  });

  client.on("message", (topic, message) => {
    console.log(`[MULTICAST] Mensaje en ${topic}: ${message.toString()}`);
  });
  */

  // /subscriber/multicast.js

  const mqtt = require('mqtt');
  const config = require('../config'); // 1. Importamos la configuración central

  // Construimos la URL del broker desde la configuración
  const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;

  const client = mqtt.connect(brokerUrl);

  // 2. Definimos el tópico MULTICAST.
  // El comodín '+' reemplaza un nivel del tópico. En este caso, el 'deviceId'.
  // Escuchará: utp/sistemas_distribuidos/grupo1/sensor-001/telemetry
  //            utp/sistemas_distribuidos/grupo1/sensor-002/telemetry
  //            ... y así sucesivamente.
  const topic = config.topics.telemetry('+');

  // Evento que se dispara al conectar
  client.on('connect', () => {
    console.log(`[INFO] Suscriptor MULTICAST conectado al broker en ${brokerUrl}`);
    
    // Nos suscribimos al tópico con el comodín
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (!err) {
        console.log(`[INFO] Suscrito exitosamente al tópico: ${topic}`);
      } else {
        console.error(`[ERROR] Error al suscribirse:`, err);
      }
    });
  });

  // Evento que se dispara al recibir un mensaje
  client.on('message', (receivedTopic, message) => {
    console.log(`\n Mensaje recibido en el tópico [${receivedTopic}]`);

    try {
      // 3. Procesamos el mensaje JSON, igual que en el unicast.
      const data = JSON.parse(message.toString());

      console.log(' Datos decodificados:');
      console.log(`   - Dispositivo: ${data.deviceId}`);
      console.log(`   - Temperatura: ${data.temperatura} C`);
      console.log(`   - Humedad: ${data.humedad} %`);
      
    } catch (error) {
      console.error('[ERROR] No se pudo decodificar el mensaje (JSON no válido):', message.toString());
    }
  });

  // Evento para manejar errores
  client.on('error', (error) => {
    console.error('[ERROR] Error de conexión:', error);
    client.end();
  });