# Usa Node 18 (ligero y compatible)
FROM node:18-slim

# Instala dependencias del sistema necesarias para Tesseract
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    libleptonica-dev \
    && rm -rf /var/lib/apt/lists/*

# Crea el directorio de trabajo
WORKDIR /app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala solo dependencias de producción
RUN npm install --omit=dev

# Copia el resto del código de la aplicación
COPY . .

# Expone el puerto (Fly detectará este automáticamente)
EXPOSE 8080

# Comando por defecto
CMD ["npm", "start"]
