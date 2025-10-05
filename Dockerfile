# Usa Node.js oficial, versión estable
FROM node:18

# Crea directorio de la app
WORKDIR /app

# Copia package.json y package-lock.json (si existe)
COPY package*.json ./

# Instala dependencias
RUN npm install

# Copia el resto del código
COPY . .

# Expone el puerto 3000
EXPOSE 3000

# Comando para ejecutar la app
CMD ["node", "main.js"]
