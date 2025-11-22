# Laboratorio de Sistemas Distribuidos (Simulador MQTT)

Este proyecto es un laboratorio práctico para el curso de Sistemas Distribuidos. Utiliza un ecosistema de microservicios en Docker para simular y visualizar algoritmos y patrones fundamentales de la computación distribuida.

## ¿Qué Hace? (Conceptos Demostrados)

El sistema simula un conjunto de sensores IoT (publishers) que compiten por recursos y publican telemetría, la cual es consumida por diversos servicios (subscribers).

Implementa y visualiza los siguientes conceptos:

* **Patrones de Comunicación:**
    * Publicación/Suscripción (Pub/Sub) con MQTT.
    * Simulación de sensores IoT enviando telemetría en formato JSON.
    * Suscriptores Unicast, Multicast y Broadcast.

* **Persistencia y Visualización:**
    * Almacenamiento de series temporales en **InfluxDB**.
    * Un **"Centro de Mando"** en tiempo real (Nginx + JavaScript) que consume datos vía WebSockets y muestra el estado de todo el sistema.

* **Sincronización de Relojes (Unidad 3):**
    * Simulación del problema de **Deriva de Reloj** (Clock Drift).
    * Implementación del **Algoritmo de Cristian** para Sincronización de Reloj Físico.
    * Implementación de **Marcas de Tiempo de Lamport** para Orden Lógico.
    * Implementación de **Relojes Vectoriales** para Orden Causal y detección de concurrencia.

* **Exclusión Mutua (Unidad 3):**
    * Implementación de un **Algoritmo Centralizado** con un coordinador (`lock-coordinator`) para gestionar el acceso a un recurso compartido (la "Estación de Calibración").

## Arquitectura y Tecnología

El sistema está completamente orquestado con Docker Compose.



* **Orquestación:** Docker & Docker Compose
* **Broker de Mensajería:** Mosquitto (Protocolos MQTT y WebSockets)
* **Base de Datos:** InfluxDB
* **Servicios (Backend):** Node.js
    * `publisher`: Simuladores de sensores (2 instancias).
    * `time-server`: Servidor de tiempo para el Algoritmo de Cristian.
    * `lock-coordinator`: Coordinador centralizado para exclusión mutua.
    * `persistence-subscriber`: Suscriptor que escribe los datos en InfluxDB.
    * `monitor`, `unicast`, etc.: Otros suscriptores de ejemplo.
* **Frontend (Centro de Mando):** Nginx (servidor web) + HTML/CSS/JavaScript (con MQTT.js).

## Puesta en Marcha

Se requiere tener **Docker** y **Docker Compose** instalados.

1.  **Construir y Ejecutar:**
    En la raíz del proyecto, ejecuta el siguiente comando. Esto construirá las imágenes de Node.js, descargará las de Mosquitto, InfluxDB y Nginx, y levantará todos los servicios.

    ```bash
    docker-compose up --build
    ```

2.  **Acceder al "Centro de Mando":**
    Una vez que los contenedores estén corriendo, abre tu navegador web y ve a:
    `http://localhost:8080`

3.  **Acceder a InfluxDB (Opcional):**
    Puedes explorar los datos almacenados en InfluxDB en `http://localhost:8086`.
    * **Usuario:** `admin`
    * **Contraseña:** `password123`
    * **Organización (Org):** `utp`
    * **Bucket:** `sensors`

4.  **Detener el Sistema:**
    Para detener y eliminar todos los contenedores y volúmenes, presiona `Ctrl+C` en la terminal y luego ejecuta:

    ```bash
    docker-compose down -v
    ```

## Próximos Pasos (Roadmap del Curso)

El proyecto está diseñado para seguir evolucionando:

* **Tolerancia a Fallos:** Implementar un **Algoritmo de Elección** (ej. "Bully") para seleccionar un nuevo `lock-coordinator` si el líder falla.
* **Exclusión Mutua Distribuida:** Reemplazar el algoritmo centralizado por uno distribuido (ej. **Ricart-Agrawala**).
* **Seguridad:** Añadir autenticación y encriptación TLS al broker Mosquitto.
