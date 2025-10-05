# Imagen base ligera y estable
FROM node:18-bookworm-slim

# Evita preguntas interactivas
ENV DEBIAN_FRONTEND=noninteractive

# Instala Tesseract y dependencias mínimas necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo
WORKDIR /app

# Copia los archivos de dependencias primero (para aprovechar cache)
COPY package*.json ./

# Instala dependencias en modo producción
RUN npm install --omit=dev

# Copia todo el código de la app
COPY . .

# Establece variable de entorno para producción
ENV NODE_ENV=production

# Expone el puerto que Fly.io usará
EXPOSE 8080

# Comando de inicio
CMD ["npm", "start"]
