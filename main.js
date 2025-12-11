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
    const GRID_COLS = 5; 
    const GRID_ROWS = 9;
    const THRESH = 800;
    const W = img.bitmap.width;
    const H = img.bitmap.height;

    const cropW = Math.floor(W * 0.55);
    const cropH = H;
    const croppedImg = img.clone().crop(0, 0, cropW, cropH);

    const cw = Math.floor(cropW / GRID_COLS);
    const ch = Math.floor(cropH / GRID_ROWS);

    const thumbs = [];

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

            if (variance >= THRESH) {
                thumbs.push({
                    x: c * cw, 
                    y: r * ch, 
                    w: cw,
                    h: ch,
                    variance
                });
            }
        }
    }

    return thumbs.sort((a, b) => b.variance - a.variance);
}


// ==== Extraer la foto principal de la derecha ====
async function detectMainPhoto(img) {
    const W = img.bitmap.width;
    const H = img.bitmap.height;

    // Extrayendo el área donde está la foto y el texto "ÁRBOL GENEALÓGICO"
    const finalW = 280;
    const finalH = 360;
    // Aseguramos que las coordenadas no sean negativas
    const cropX = Math.max(0, W - finalW - 10);
    const cropW = Math.min(W - cropX, finalW + 10);
    
    const area = img.clone().crop(cropX, 0, cropW, finalH);
    
    return area;
}

// ==== Construir imagen final (CORRECCIÓN IMPLEMENTADA AQUÍ) ====
async function buildTree(buffer, text, thumbs, dni) {
    const OUTPUT_W = 1080;
    const OUTPUT_H = 1920;

    // Aseguramos que Jimp lea correctamente el archivo de fondo
    if (!fs.existsSync(BG_PATH)) {
         throw new Error("El archivo de fondo no existe en: " + BG_PATH);
    }
    const bg = await Jimp.read(BG_PATH);
    bg.resize(OUTPUT_W, OUTPUT_H);

    // --- Carga de Fuentes (Opcional si no se usan) ---
    // const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    
    const orig = await Jimp.read(buffer);

    // --- 1. Reconstrucción del Bloque Derecho (Foto Principal + Título/Resumen) ---
    const rightBlockW = 380;
    const rightBlockH = 550;
    
    // Asegurar que las coordenadas de corte sean válidas
    const cropX = Math.max(0, orig.bitmap.width - rightBlockW - 10);
    const cropW = Math.min(orig.bitmap.width - cropX, rightBlockW + 10);

    const rightBlock = orig.clone().crop(cropX, 0, cropW, rightBlockH);

    const rightBlockFinalX = OUTPUT_W - rightBlockW - 30;
    const rightBlockFinalY = 10;
    
    rightBlock.resize(rightBlockW, rightBlockH);
    bg.composite(rightBlock, rightBlockFinalX, rightBlockFinalY);


    // --- 2. Reconstrucción de la Grilla Izquierda (Miniaturas) ---

    const colCount = 5;
    const rowCount = 10; 
    const thumbW = 140; 
    const thumbH = 180;
    const gapX = 4;
    const gapY = 0; 

    const startX = 20; 
    const startY = 10;

    // CORRECCIÓN: Usar 100 como valor predeterminado si 'thumbs' está vacío, 
    // en lugar de depender de Math.max() con un array vacío, que puede dar -Infinity
    // y causar errores de cálculo.
    const defaultDim = 100;
    const minThumbW = thumbs.length > 0 ? Math.max(...thumbs.map(t => t.w)) : defaultDim;
    const minThumbH = thumbs.length > 0 ? Math.max(...thumbs.map(t => t.h)) : defaultDim;


    for (let i = 0; i < thumbs.length && i < colCount * rowCount; i++) {
        const t = thumbs[i];

        if (t.w < 50 || t.h < 50) continue; 
        
        const col = i % colCount; 
        const row = Math.floor(i / colCount); 
        
        const x = startX + col * (thumbW + gapX);
        const y = startY + row * (thumbH + gapY);
        
        // Cortar la miniatura (foto + datos)
        const cutW = minThumbW; 
        const cutH = Math.floor(minThumbH * 1.8); 
        
        // Asegurar que las coordenadas de corte no excedan los límites de la imagen original
        const finalCutW = Math.min(orig.bitmap.width - t.x, cutW);
        const finalCutH = Math.min(orig.bitmap.height - t.y, cutH);

        // Si el corte es muy pequeño, saltar
        if (finalCutW <= 0 || finalCutH <= 0) continue;

        const s = orig.clone().crop(t.x, t.y, finalCutW, finalCutH);
        
        s.resize(thumbW, thumbH);
        
        bg.composite(s, x, y);
    }
    
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
