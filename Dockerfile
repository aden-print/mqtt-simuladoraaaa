# --- Dockerfile ---

# Etapa 1: Imagen base con Node.js
# Usamos una imagen oficial de Node.js v18 sobre Alpine Linux (ligera)
FROM node:18-alpine As base

# Establecemos el directorio de trabajo dentro del contenedor
# Todo lo que hagamos a partir de aquí será relativo a /usr/src/app
WORKDIR /usr/src/app

# Copiamos solo los archivos necesarios para instalar dependencias
# Esto aprovecha la caché de capas de Docker: si package*.json no cambian,
# no se volverá a ejecutar 'npm install' en reconstrucciones futuras.
COPY package*.json ./

# Etapa 2: Instalación de dependencias (solo si es necesario para producción)
# Si tuviéramos dependencias de compilación, podríamos hacerlo en una etapa separada.
# Por ahora, instalamos las dependencias de producción.
RUN npm ci --only=production

# Etapa 3: Copia del código fuente
# Copiamos todo el resto del código de la aplicación
COPY . .

# Comando por defecto (será sobreescrito en docker-compose.yml)
# Define un punto de entrada por defecto si ejecutáramos la imagen directamente.
# Aquí, por ejemplo, ejecutaría el publisher.
CMD [ "node", "publisher/publisher.js" ]