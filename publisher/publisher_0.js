const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://broker.hivemq.com');

client.on('connect', () => {
  console.log('Conectado al broker MQTT');

  // UNICAST → mensaje a un usuario específico
  client.publish('sistema/unicast/usuarioA', 'Mensaje privado a Usuario A');

  // MULTICAST → mensaje a un grupo (ej: zona norte)
  client.publish('sistema/multicast/zonaNorte', 'Actualización para Zona Norte');

  // BROADCAST → alerta para todos los nodos
  client.publish('sistema/broadcast/general', 'ALARMA GLOBAL: Servicio caído');
});
