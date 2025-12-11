/**
 * main.js – Árbol genealógico GRATIS (sin Google Vision)
 * * OCR con Tesseract + reconstrucción personalizada con JIMP.
 * Reconstrucción enfocada en replicar el diseño original:
 * 1. Miniaturas en grilla a la izquierda.
 * 2. Foto principal, título y resumen de datos a la derecha.
 * 3. Fondo personalizado.
 */

const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const Tesseract = require("tesseract.js");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// ==== CONFIG ====
const REMOTE_BASE = "https://web-production-75681.up.railway.app";
const API_AGV_PATH = "/agv";

const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const BG_PATH = path.join(PUBLIC_DIR, "bg.png");

// Fondo personalizado (la imagen azul/roja)
const BG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhinBHvbtHY2piKZ_DU6UDvmS4rujMacF6Me5bFXkNjCR_yiF4XMWcIGjrXHxJbE8Lb2yrYmkbo_2dBQlNdImTStPgQPcKVaKEdTjnHg06ZBuS1eAQUr8jzBOxRc8WEzsHT2Kpio6o-7gLPaJ6vZvK4u7euXXWth9XPs_3ZXLsVpBx1BLTYXT1MPm9kic51/s3000/1000039235.png";

axios.defaults.timeout = 60000;

// === SERVIR ARCHIVOS ESTÁTICOS ===
app.use("/public", express.static(PUBLIC_DIR));

// Descargar fondo si no existe
async function ensureAssets() {
    if (!fs.existsSync(BG_PATH)) {
        console.log("Descargando fondo...");
        const buf = await axios.get(BG_URL, { responseType: "arraybuffer" });
        // Intentar leer y guardar en PNG para asegurar compatibilidad
        const jbg = await Jimp.read(Buffer.from(buf.data));
        await jbg.writeAsync(BG_PATH);
        console.log("Fondo nuevo guardado");
    }
}

// ==== OCR GRATIS ====
async function freeOCR(buffer) {
    try {
        const result = await Tesseract.recognize(buffer, "spa", {
            logger: () => {}
        });
        return result.data.text.trim();
    } catch (e) {
        console.error("OCR error:", e);
        return "";
    }
}

// ==== Detectar miniaturas (Optimizado para el diseño original) ====
async function detectThumbs(img) {
    // Estas son las proporciones del lado izquierdo del diseño original.
    const GRID_COLS = 5; 
    const GRID_ROWS = 9; // Suficiente para la mayoría de los casos

    const THRESH = 800;
    const W = img.bitmap.width;
    const H = img.bitmap.height;

    // Se asume que el árbol genealógico ocupa gran parte de la imagen,
    // y la grilla está centrada/distribuida. 
    // Usamos el 80% del ancho para la grilla y el resto para la foto principal.
    const cropW = Math.floor(W * 0.55); // Ajuste para cubrir la grilla a la izquierda
    const cropH = H;
    const croppedImg = img.clone().crop(0, 0, cropW, cropH);

    const cw = Math.floor(cropW / GRID_COLS);
    const ch = Math.floor(cropH / GRID_ROWS);

    const thumbs = [];

    // Iteramos sobre el área donde deberían estar las miniaturas.
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const crop = croppedImg.clone().crop(c * cw, r * ch, cw, ch);

            let sum = 0, sum2 = 0, n = 0;
            crop.scan(0, 0, crop.bitmap.width, crop.bitmap.height, function (x, y, idx) {
                const R = this.bitmap.data[idx];
                const G = this.bitmap.data[idx + 1];
                const B = this.bitmap.data[idx + 2];
                const l = Math.round(0.299 * R + 0.587 * G + 0.114 * B);
                sum += l;
                sum2 += l * l;
                n++;
            });

            const mean = sum / n;
            const variance = sum2 / n - mean * mean;

            // La varianza alta indica mucha diferencia de color (una foto con bordes)
            if (variance >= THRESH) {
                thumbs.push({
                    x: c * cw, // Coordenada X original en la imagen completa
                    y: r * ch, // Coordenada Y original en la imagen completa
                    w: cw,
                    h: ch,
                    variance
                });
            }
        }
    }

    // Ordenamos por varianza para tomar las 'mejores' detecciones primero.
    return thumbs.sort((a, b) => b.variance - a.variance);
}


// ==== Extraer la foto principal de la derecha ====
async function detectMainPhoto(img) {
    const W = img.bitmap.width;
    const H = img.bitmap.height;

    // Se asume que la foto principal está en la parte superior derecha.
    // Probar un área de 30% de ancho desde el 60% hacia adelante.
    const cropX = Math.floor(W * 0.6);
    const cropY = 0;
    const cropW = Math.floor(W * 0.4);
    const cropH = Math.floor(H * 0.25); // Solo la parte superior

    const mainPhotoCrop = img.clone().crop(cropX, cropY, cropW, cropH);
    
    // Simplificación: Asumimos que la foto principal es la única con un alto contraste
    // dentro de ese recuadro, o simplemente extraemos el área.
    
    // Si queremos ser más precisos, habría que detectar el recuadro, pero para replicar
    // el diseño, simplemente extraemos el área donde ESTÁ el recuadro grande.
    // Un área de 200x200 píxeles dentro de la esquina superior derecha puede funcionar como proxy.
    
    const photoW = 220; // Tamaño aproximado de la foto principal
    const photoH = 220;
    
    // Asumimos que la foto grande está centrada en la esquina superior derecha del diseño original.
    const mainPhotoX = W - photoW - 50; 
    const mainPhotoY = 50;

    // Si detectamos un área de alto contraste en esa zona, la cortamos.
    // Para simplificar la reconstrucción visual, tomaremos el área predefinida 
    // y la redimensionaremos a la medida del lienzo final.
    
    // Extrayendo el área donde está la foto y el texto "ÁRBOL GENEALÓGICO"
    const finalW = 280;
    const finalH = 360;
    const area = img.clone().crop(W - finalW - 10, 0, finalW + 10, finalH);
    
    return area;
}

// ==== Construir imagen final ====
async function buildTree(buffer, text, thumbs, dni) {
    const OUTPUT_W = 1080;
    const OUTPUT_H = 1920;

    const bg = await Jimp.read(BG_PATH);
    bg.resize(OUTPUT_W, OUTPUT_H);

    // --- Carga de Fuentes ---
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontHeader = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_10_WHITE);
    
    const orig = await Jimp.read(buffer);

    // --- 1. Reconstrucción del Bloque Derecho (Foto Principal + Título/Resumen) ---
    
    // Extraemos la sección de la esquina superior derecha del original (Contiene Título, Foto, Resumen)
    // Esto es un hack para no tener que recrear el layout de texto y foto con Jimp.
    const rightBlockW = 380;
    const rightBlockH = 550;
    const rightBlock = orig.clone().crop(orig.bitmap.width - rightBlockW - 10, 0, rightBlockW + 10, rightBlockH);

    // Posición del bloque derecho en la imagen final
    const rightBlockFinalX = OUTPUT_W - rightBlockW - 30;
    const rightBlockFinalY = 10;
    
    // Redimensionamos para que encaje bien en el lienzo final
    rightBlock.resize(rightBlockW, rightBlockH);
    bg.composite(rightBlock, rightBlockFinalX, rightBlockFinalY);


    // --- 2. Reconstrucción de la Grilla Izquierda (Miniaturas) ---

    const colCount = 5;
    const rowCount = 10; // Para cubrir las 50 miniaturas
    const thumbW = 140; 
    const thumbH = 180; // La miniatura es rectangular en el diseño original (foto + texto debajo)
    const gapX = 4;
    const gapY = 0; // Se ven muy pegadas verticalmente en el original

    // Puntos de inicio para la grilla
    const startX = 20; 
    const startY = 10;

    // Aseguramos que las miniaturas tengan al menos el tamaño necesario para la extracción.
    const minThumbW = Math.max(...thumbs.map(t => t.w));
    const minThumbH = Math.max(...thumbs.map(t => t.h));


    for (let i = 0; i < thumbs.length && i < colCount * rowCount; i++) {
        const t = thumbs[i];

        // Validamos que la miniatura tiene un tamaño razonable para la extracción
        if (t.w < 50 || t.h < 50) continue; 
        
        // El diseño original tiene 50 miniaturas rectangulares (foto + datos)
        // en una grilla de 5 columnas.
        
        // Calculamos la posición en la grilla final
        const col = i % colCount; 
        const row = Math.floor(i / colCount); 
        
        // Coordenadas en la imagen final
        const x = startX + col * (thumbW + gapX);
        const y = startY + row * (thumbH + gapY);
        
        // Cortar la miniatura (foto + datos)
        // NOTA: Para replicar el diseño de "miniatura + datos", 
        // necesitamos cortar una sección rectangular (más alta que ancha) del original.
        const cutW = minThumbW; // Usamos el tamaño detectado promedio
        const cutH = Math.floor(minThumbH * 1.8); // Lo hacemos más alto para incluir datos
        
        const s = orig.clone().crop(t.x, t.y, cutW, cutH);
        
        // Redimensionar para encajar en el recuadro final
        s.resize(thumbW, thumbH);
        
        bg.composite(s, x, y);
    }

    // --- 3. Limpieza y toque final (Opcional: Añadir título/info si no se usó el hack) ---
    // Si el hack de 'rightBlock' no funcionara o se quisiera un control total:
    // bg.print(fontTitle, rightBlockFinalX, rightBlockFinalY + 20, `ÁRBOL GENEALÓGICO`);
    // bg.print(fontHeader, rightBlockFinalX, rightBlockFinalY + 80, `DNI: ${dni}`);
    
    // Esto asegura que el fondo sea el de la imagen 3 (azul/rojo) y no el fondo original.
    // También desaparecen las marcas de agua de la API.

    return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ==== ENDPOINT PRINCIPAL ====
app.get("/agv-proc-free", async (req, res) => {
    const dni = String(req.query.dni || "").trim();
    if (!dni) return res.status(400).json({ error: "dni obligatorio" });

    try {
        const apiURL = `${REMOTE_BASE}${API_AGV_PATH}?dni=${dni}`;
        console.log(`Petición a API: ${apiURL}`);
        const apiResp = await axios.get(apiURL);

        // La API devuelve urls.DOCUMENT
        const imgURL = apiResp.data?.urls?.DOCUMENT;
        if (!imgURL) {
            console.log("Respuesta API:", apiResp.data);
            throw new Error("La API no devolvió DOCUMENT");
        }
        
        console.log(`Descargando imagen: ${imgURL}`);
        const buf = await axios.get(imgURL, { responseType: "arraybuffer" });
        const imgBuf = Buffer.from(buf.data);
        
        const jimg = await Jimp.read(imgBuf);
        
        // OCR se mantiene por si se necesita la data en el futuro
        const text = await freeOCR(imgBuf); 
        
        const thumbs = await detectThumbs(jimg);
        
        console.log(`Miniaturas detectadas: ${thumbs.length}`);

        // Construir la imagen final con el nuevo layout
        const final = await buildTree(imgBuf, text, thumbs, dni); 
        
        const out = `tree_${dni}_${uuidv4()}.png`;
        const pathFull = path.join(PUBLIC_DIR, out);
        await fs.promises.writeFile(pathFull, final);
        
        const finalURL = `https://arbol-genialogico-v2.fly.dev/public/${out}`; // Asumiendo el dominio fly.dev

        return res.json({
            ok: true,
            message: "Procesado gratis - Diseño replicado",
            dni,
            // ocr: text, // Se comenta para limpiar la respuesta
            url: finalURL
        });

    } catch (e) {
        console.error("Error en el procesamiento:", e.message);
        return res.status(500).json({ error: e.message });
    }
});

ensureAssets().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`Servidor listo. Escuchando en http://${HOST}:${PORT}`);
    });
}).catch(e => {
    console.error("Fallo al iniciar el servidor debido a assets:", e.message);
});

// Nota: Para que Jimp funcione correctamente, debes asegurarte de que tu entorno
// tiene las dependencias necesarias. En un entorno Linux, esto a veces requiere:
// sudo apt-get install build-essential imagemagick
