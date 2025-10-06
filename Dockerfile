# Usa Node.js oficial versión estable
FROM node:18

# Crea el directorio de la app
WORKDIR /app

# Copia package.json y package-lock.json (si existe)
COPY package*.json ./

# Instala dependencias de producción (sin las de desarrollo)
RUN npm install --only=production

# Copia el resto del código fuente
COPY . .

# Establece variable de entorno de producción
ENV NODE_ENV=production

# Expone el puerto 3000 (coincide con main.js y fly.toml)
EXPOSE 3000

# Comando para ejecutar la app
CMD ["npm", "start"]
