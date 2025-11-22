#!/bin/bash
# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
echo -e "${YELLOW} INICIANDO PROYECTO EL CURSO FACILITO: PROTOCOLO DE EVALUACIÓN
${NC}"
echo "Asegúrese de tener 5 publishers corriendo: publisher-1 al publisher-5"
sleep 2
# ==============================================================================
# NIVEL 1: RESGUARDANDO EL TIEMPO
# ==============================================================================
echo -e "\n${YELLOW}[FASE 1] Probando Integridad Temporal...${NC}"
# 1. Inyectamos un mensaje malicioso (Time Travel Attack)
echo " -> Inyectando mensaje del año 2050..."
docker exec mqtt-broker mosquitto_pub -t "sensors/telemetry" -m '{"deviceId":
"malicious-node", "timestamp": "2050-01-01T00:00:00Z", "temperatura": 1000}'
sleep 2
# Verificamos si el suscriptor lo rechazó
if docker logs persistence-subscriber 2>&1 | grep -q "Rejected future packet";
then
 echo -e "${GREEN} ÉXITO: El ataque temporal fue neutralizado.${NC}"
else
 echo -e "${RED} FALLO: El sistema aceptó datos corruptos o no logueó el
rechazo.${NC}"
 exit 1
fi
# ==============================================================================
# NIVEL 2: SPLIT-BRAIN
# ==============================================================================
echo -e "\n${YELLOW}[FASE 2] Probando Estabilidad de Liderazgo (Quórum)...${NC}"
# Identificar al líder actual (asumimos que el log imprime "I am LEADER")
LEADER_CONTAINER=$(docker ps | grep publisher | head -n 1 | awk '{print $NF}')
echo " -> Líder actual detectado (aprox): $LEADER_CONTAINER"
# Pausamos al líder (simulamos partición de red/congelamiento, no muerte aun)
echo " -> Congelando al líder (SIGSTOP)..."
docker pause $LEADER_CONTAINER
sleep 7 # Esperamos más que el Lease (5s)
# Verificamos si alguien más tomó el mando
NEW_LEADER_LOGS=$(docker logs publisher-1 2>&1 | grep "Ascendido a Lider" | tail
-n 1)
if [ -z "$NEW_LEADER_LOGS" ]; then
 # Intentamos ver otros logs
 echo " -> Buscando nuevo líder..."
fi
# Descongelamos
docker unpause $LEADER_CONTAINER
sleep 2
# Verificamos que el viejo líder NO siga creyéndose líder (debe haber visto que
perdió el lease)
if docker logs $LEADER_CONTAINER --tail 10 | grep -q "Stepping down"; then
 echo -e "${GREEN} ÉXITO: Transición de poder ordenada y recuperación de
Split-Brain.${NC}"
else
 echo -e "${YELLOW} ALERTA: Verificar manualmente si hay dos líderes. Buscando
'Stepping down' en logs.${NC}"
fi
# ==============================================================================
# NIVEL 3: PERSISTENCIA
# ==============================================================================
echo -e "\n${YELLOW}[FASE 3] Probando Recuperación de Estado (WAL)...${NC}"
# Forzamos una cola (simulado enviando peticiones rapidas)
echo " -> Generando tráfico para llenar la cola..."
docker exec publisher-2 node -e "require('./config').topics..." > /dev/null 2>&1
&
# Matamos violentamente al contenedor que sea líder
echo " -> KILL -9 al Líder..."
# (Aquí simplificamos matando al publisher-5 que suele ser el de mayor prioridad)
docker restart publisher-5
sleep 5
# Verificamos si recuperó la memoria
if docker logs publisher-5 --tail 50 | grep -q -E "WAL|Restored|Recovered"; then
 echo -e "${GREEN} ÉXITO: El sistema recordó el estado previo a la
muerte.${NC}"
else
 echo -e "${RED} FALLO: El líder revivió con Amnesia (sin logs de
recuperación).${NC}"
 exit 1
fi
echo -e "\n${YELLOW} EVALUACIÓN COMPLETADA ${NC}"