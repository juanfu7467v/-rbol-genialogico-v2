/**
 * main.js – Árbol genealógico GRATIS (sin Google Vision)
 * * RECONSTRUCCIÓN AVANZADA (Diseño Limpio y Profesional)
 * 1. Intenta extraer datos estructurados del OCR desordenado.
 * 2. Reconstruye el diseño con tarjetas limpias, grillas perfectas y fondo degradado.
 * 3. Usa colores (ej. azul/rojo) para diferenciar secciones.
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

// ==== PARSEO DE TEXTO OCR (Simplificado) ====
// Intenta emparejar las miniaturas con la data familiar
function parseOCRText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    const data = [];

    // Patrón simplificado para buscar DNI o Número + Texto (Nombre/Rol/Edad)
    const personRegex = /(\d{7,8}(?:-\d)?)\s+(.+?)(?:\s+(\d{1,3}\s+AÑOS|\d{1,3} AÑOS))?/i;

    for (const line of lines) {
        const match = line.match(personRegex);
        if (match) {
            data.push({
                dni: match[1],
                info: match[2].trim(), // Nombre y Rol
                edad: match[3] ? match[3].trim() : ''
            });
        }
    }
    return data;
}

// ==== Detectar miniaturas (Igual que antes, solo posición) ====
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


// ==== FUNCION DE DIBUJO DE TARJETA LIMPIA ====
async function drawCleanCard(bg, orig, thumb, data, x, y, cardWidth, cardHeight, isPaternal, fontSmall, fontTiny) {
    const photoSize = 100;
    const padding = 8;
    const cardColor = isPaternal ? 0xFF0000FF : 0x0047ABFF; // Rojo para Paterno, Azul oscuro para Materno
    const borderColor = 0xFFFFFFFF; // Borde blanco
    const textColor = 0xFFFFFFFF; // Texto blanco

    // 1. Dibujar el fondo de la tarjeta
    new Jimp(cardWidth, cardHeight, 0x1A1A1A99, (err, cardBg) => {
        if (err) throw err;
        bg.composite(cardBg, x, y);
    });

    // 2. Dibujar la foto
    let s;
    try {
        // Cortar solo la foto del área de la miniatura detectada
        s = orig.clone().crop(thumb.x, thumb.y, thumb.w, thumb.h);
        s.cover(photoSize, photoSize);
        s.circle(); // Hacerla redonda para un look moderno
        s.border(2, borderColor); // Borde blanco
        bg.composite(s, x + padding, y + padding);
    } catch (e) {
        console.warn("Fallo al procesar miniatura:", e.message);
    }

    // 3. Dibujar la información de la tarjeta
    const textX = x + photoSize + 2 * padding;
    let textY = y + padding;

    // Rol (Paterno / Materno / Hijo / Tío, etc.) - Usar el color de la tarjeta
    const rolText = data.info.split(/\s+/).pop() || (isPaternal ? 'Familiar Paterno' : 'Familiar Materno');
    
    // Crear un pequeño recuadro de color para el rol
    const rolBg = new Jimp(cardWidth - (photoSize + 3 * padding), 20, cardColor, (err, box) => {
        if (err) throw err;
        bg.composite(box, textX, textY);
    });
    bg.print(fontTiny, textX + 4, textY + 2, { text: rolText.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, cardWidth - (photoSize + 3 * padding));
    textY += 24;

    // Nombre (Intentamos extraer solo el nombre)
    const nameText = data.info.replace(rolText, '').trim();
    bg.print(fontSmall, textX, textY, { text: nameText, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, cardWidth - (photoSize + 3 * padding));
    textY += 20;

    // DNI y Edad
    bg.print(fontTiny, textX, textY, { text: `DNI: ${data.dni}`, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, cardWidth - (photoSize + 3 * padding));
    textY += 14;
    
    if (data.edad) {
        bg.print(fontTiny, textX, textY, { text: `Edad: ${data.edad}`, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, cardWidth - (photoSize + 3 * padding));
    }
}


// ==== Construir imagen final (NUEVO DISEÑO) ====
async function buildTree(buffer, text, thumbs, dni) {
    const OUTPUT_W = 1080;
    const OUTPUT_H = 1920;
    const CARD_W = 320;
    const CARD_H = 120;
    const GAP = 12;
    const GRID_COLS = 3;

    // 1. Inicializar Fondo y Fuentes
    if (!fs.existsSync(BG_PATH)) throw new Error("El archivo de fondo no existe.");
    const bg = await Jimp.read(BG_PATH);
    bg.resize(OUTPUT_W, OUTPUT_H);

    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontHeader = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontTiny = await Jimp.loadFont(Jimp.FONT_SANS_10_WHITE);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_14_WHITE);

    const orig = await Jimp.read(buffer);
    
    // 2. Procesar Texto OCR y Emparejar Miniaturas
    const parsedData = parseOCRText(text);
    const combinedData = thumbs.slice(0, 50).map((thumb, index) => {
        // Intentar emparejar la miniatura con los datos estructurados por índice
        return {
            thumb: thumb,
            data: parsedData[index] || { dni: 'N/A', info: 'Persona ' + (index + 1), edad: '' },
            isPaternal: index < 25 // Asumiendo que las primeras 25 son Paternas y las siguientes 25 Maternas (como en el original)
        };
    });
    
    // 3. Dibujar Encabezado (Título y Foto Principal)
    
    // Título
    bg.print(fontTitle, 40, 40, `ÁRBOL GENEALÓGICO`);
    bg.print(fontHeader, 40, 110, `DNI Consultado: ${dni}`);

    // Foto Principal (asumiendo que es la primera miniatura o una extracción grande)
    const mainPhotoArea = await Jimp.read(orig.getBufferAsync(Jimp.MIME_PNG));
    const mainPhotoW = 200;
    
    try {
        const mainPhoto = mainPhotoArea.clone().crop(orig.bitmap.width * 0.7, 50, 200, 250); // Estimar la posición del grande
        mainPhoto.cover(mainPhotoW, mainPhotoW * 1.2);
        mainPhoto.border(4, 0xDDDDDDFF);
        bg.composite(mainPhoto, OUTPUT_W - mainPhotoW - 40, 40);
        bg.print(fontData, OUTPUT_W - mainPhotoW - 40, 40 + mainPhotoW * 1.2 + 8, `Familiares: ${thumbs.length}`, mainPhotoW);
    } catch (e) {
        console.warn("No se pudo extraer/dibujar la foto principal.");
    }


    // 4. Dibujar las Grillas de Tarjetas (Paterna / Materna)

    const START_Y = 320; // Debajo del encabezado
    let currentY = START_Y;
    
    // --- Sección Paterna ---
    bg.print(fontHeader, 40, currentY, "Familiares Paternos", 0xFF0000FF);
    currentY += 40;

    for (let i = 0; i < combinedData.length && i < 25; i++) {
        const item = combinedData[i];
        
        const col = i % GRID_COLS; 
        const row = Math.floor(i / GRID_COLS); 
        
        const x = 20 + col * (CARD_W + GAP);
        const y = currentY + row * (CARD_H + GAP);

        await drawCleanCard(bg, orig, item.thumb, item.data, x, y, CARD_W, CARD_H, true, fontSmall, fontTiny);
    }
    
    // Ajustar Y para la siguiente sección
    currentY += Math.ceil(Math.min(25, combinedData.length) / GRID_COLS) * (CARD_H + GAP) + 20;

    // --- Sección Materna ---
    if (combinedData.length > 25) {
        bg.print(fontHeader, 40, currentY, "Familiares Maternos", 0x0047ABFF);
        currentY += 40;

        for (let i = 25; i < combinedData.length && i < 50; i++) {
            const item = combinedData[i];
            
            const indexInMaternal = i - 25;
            const col = indexInMaternal % GRID_COLS; 
            const row = Math.floor(indexInMaternal / GRID_COLS); 
            
            const x = 20 + col * (CARD_W + GAP);
            const y = currentY + row * (CARD_H + GAP);

            await drawCleanCard(bg, orig, item.thumb, item.data, x, y, CARD_W, CARD_H, false, fontSmall, fontTiny);
        }
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
        
        // OCR y detección de miniaturas
        const text = await freeOCR(imgBuf); 
        const thumbs = await detectThumbs(jimg);
        
        console.log(`Miniaturas detectadas: ${thumbs.length}`);

        // Construir la imagen final con el NUEVO DISEÑO
        const final = await buildTree(imgBuf, text, thumbs, dni); 
        
        const out = `tree_${dni}_${uuidv4()}.png`;
        const pathFull = path.join(PUBLIC_DIR, out);
        await fs.promises.writeFile(pathFull, final);
        
        const finalURL = `https://arbol-genialogico-v2.fly.dev/public/${out}`; // Asumiendo el dominio fly.dev

        return res.json({
            ok: true,
            message: "Procesado gratis - Diseño Profesional y Limpio",
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
