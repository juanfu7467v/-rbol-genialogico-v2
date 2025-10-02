FROM node:18-slim

# Instala dependencias del sistema necesarias para Tesseract y Jimp
RUN apt-get update && apt-get install -y \
  tesseract-ocr \
  libtesseract-dev \
  libleptonica-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
