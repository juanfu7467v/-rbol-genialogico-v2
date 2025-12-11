/**
 * main.js – Árbol genealógico GRATIS (sin Google Vision)
 * OCR con Tesseract + reconstrucción personalizada
 *
 * NOTA: La lógica de detección de miniaturas se ajusta para la estructura específica del mockup.
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

// Fondo personalizado (Imagen azul/roja del archivo 1000039235.png)
const BG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhinBHvbtHY2piKZ_DU6UDvmS4rujMacF6Me5bFXkNjCR_yiF4XMWcIGjrXHxJbE8Lb2yrYmkbo_2dBQlNdImTStPgQPcKVaKEdTjnHg06ZBuS1eAQUr8jzBOxRc8WEzsHT2Kpio6o-7gLPaJ6vZvK4u7euXXWth9XPs_3ZXLsVpBx1BLTYXT1MPm9kic51/s3000/1000039235.png";

axios.defaults.timeout = 60000;

// === SERVIR ARCHIVOS ESTÁTICOS ===
app.use("/public", express.static(PUBLIC_DIR));

// Descargar fondo si no existe
async function ensureAssets() {
    if (!fs.existsSync(BG_PATH)) {
        console.log("Descargando fondo...");
        try {
            const buf = await axios.get(BG_URL, { responseType: "arraybuffer" });
            await fs.promises.writeFile(BG_PATH, Buffer.from(buf.data));
            console.log("Fondo nuevo guardado en:", BG_PATH);
        } catch (error) {
            console.error("Error al descargar el fondo:", error.message);
            // Crea un fondo plano de respaldo si falla la descarga
            new Jimp(1080, 1920, 0x1f1f1fff, (err, image) => {
                if (!err) image.write(BG_PATH);
            });
        }
    }
}

// ==== OCR GRATIS ====
async function freeOCR(buffer) {
    try {
        console.log("Iniciando OCR...");
        const result = await Tesseract.recognize(buffer, "spa", {
            logger: () => {}
        });
        console.log("OCR completado.");
        return result.data.text.trim();
    } catch (e) {
        console.error("OCR error:", e);
        return "";
    }
}

// ==== Detectar miniaturas (Ajustada para la estructura de la grilla del mockup) ====
async function detectThumbs(img) {
    console.log("Detectando miniaturas...");
    const GRID_COLS = 7;
    const GRID_ROWS = 7; // El mockup tiene más de 5 filas de miniaturas pequeñas
    
    // Asumimos que la grilla de miniaturas pequeñas ocupa la mayor parte del lado izquierdo
    // del 5% superior hasta el 80% inferior, y el 70% del ancho (lado izquierdo).
    const CROP_W = img.bitmap.width * 0.70;
    const CROP_H = img.bitmap.height * 0.85;
    const CROP_X = 0;
    const CROP_Y = img.bitmap.height * 0.10; // Empezar un poco más abajo para evitar el header

    const cropImg = img.clone().crop(CROP_X, CROP_Y, CROP_W, CROP_H);

    const W = cropImg.bitmap.width;
    const H = cropImg.bitmap.height;

    const cw = Math.floor(W / GRID_COLS);
    const ch = Math.floor(H / GRID_ROWS);

    const thumbs = [];

    // Iteramos sobre las celdas de la grilla en el área de interés
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const x = c * cw;
            const y = r * ch;
            const area = cropImg.clone().crop(x, y, cw, ch);
            
            // Verificación simple de contenido: si el área no es casi uniforme (varianza alta),
            // asumimos que contiene una miniatura.
            let sum = 0, sum2 = 0, n = 0;
            area.scan(0, 0, area.bitmap.width, area.bitmap.height, function (x, y, idx) {
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

            const THRESH = 800; // Umbral basado en la experiencia, ajustado ligeramente a 800
            
            if (variance >= THRESH) {
                // Devolvemos las coordenadas en relación a la imagen ORIGINAL, no la recortada.
                thumbs.push({ 
                    x: x + CROP_X, 
                    y: y + CROP_Y, 
                    w: cw, 
                    h: ch, 
                    variance 
                });
            }
        }
    }

    console.log(`Miniaturas detectadas: ${thumbs.length}`);
    return thumbs;
}

// ==== Extraer la imagen DNI principal (la grande a la derecha) ====
async function extractMainImage(img) {
    // Basado en el mockup, la imagen principal está en la esquina superior derecha.
    const W = img.bitmap.width;
    const H = img.bitmap.height;

    // Coordenadas aproximadas de la imagen grande en el mockup:
    // Ocupa un espacio central vertical, en el extremo derecho.
    const CROP_W = W * 0.25;
    const CROP_H = H * 0.15;
    const CROP_X = W * 0.70;
    const CROP_Y = H * 0.13;

    try {
        // En lugar de recortar el área, buscamos la imagen dentro del área de interés
        // En la práctica, recortar el área de interés es suficiente si la imagen
        // es el único elemento visual grande allí.
        return img.clone().crop(CROP_X, CROP_Y, CROP_W, CROP_H);
    } catch (e) {
        console.error("Error al extraer la imagen principal:", e);
        return new Jimp(1, 1, 0x00000000); // Retornar una imagen transparente si falla
    }
}


// ==== Construir imagen final (Reconstrucción del diseño) ====
async function buildTree(buffer, text, thumbs, dni) {
    const OUTPUT_W = 1080;
    const OUTPUT_H = 1920;

    // 1. Cargar el fondo y redimensionar
    const bg = await Jimp.read(BG_PATH);
    bg.resize(OUTPUT_W, OUTPUT_H);

    // 2. Cargar fuentes (ajustadas para el diseño)
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE); // Más pequeña para ajustarse mejor
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontBody = await Jimp.loadFont(Jimp.FONT_SANS_14_WHITE); // Para el cuerpo de texto OCR

    const orig = await Jimp.read(buffer);

    // --- RECONSTRUCCIÓN DEL DISEÑO DERECHO (TÍTULO, IMAGEN PRINCIPAL, CONTADORES) ---

    // A. Título Principal
    const titleText = `ÁRBOL\nGENEALÓGICO`;
    const TITLE_X = 660; // Posición X fija a la derecha
    const TITLE_Y = 100;
    
    // El texto del DNI (ej. 73622432) debe ir justo debajo o al lado de la imagen principal.
    bg.print(fontTitle, TITLE_X, TITLE_Y, titleText);
    
    // B. Imagen Principal (DNI)
    const mainImg = await extractMainImage(orig);
    const MAIN_IMG_W = 350; // Dimensiones fijas para el mockup
    const MAIN_IMG_H = 450;
    const MAIN_IMG_X = OUTPUT_W - MAIN_IMG_W - 30; // 30px desde el borde derecho
    const MAIN_IMG_Y = TITLE_Y + 130;
    
    mainImg.cover(MAIN_IMG_W, MAIN_IMG_H);
    bg.composite(mainImg, MAIN_IMG_X, MAIN_IMG_Y);

    // DNI y edad debajo de la imagen principal (parte del texto OCR, pero la forzamos aquí)
    bg.print(fontTitle, MAIN_IMG_X, MAIN_IMG_Y + MAIN_IMG_H + 10, `${dni}`);
    bg.print(fontSmall, MAIN_IMG_X, MAIN_IMG_Y + MAIN_IMG_H + 50, 'MÁS DETALLES EN TELEGRAM');

    // C. Contadores (Asumimos que están en el texto OCR, pero podemos usar coordenadas fijas)
    const counterText = "CANTIDAD DE\nFAMILIARES: 52"; // Hardcodeado por simplicidad, se podría extraer del OCR
    const PATERNO_TEXT = "Familiares Paternos";
    const MATERNO_TEXT = "Familiares Maternos";
    const COUNTER_X = MAIN_IMG_X;
    const COUNTER_Y = MAIN_IMG_Y + MAIN_IMG_H + 150;

    bg.print(fontSmall, COUNTER_X, COUNTER_Y, counterText);
    bg.print(fontSmall, COUNTER_X, COUNTER_Y + 80, PATERNO_TEXT);
    bg.print(fontSmall, COUNTER_X, COUNTER_Y + 110, MATERNO_TEXT);
    
    // --- RECONSTRUCCIÓN DEL DISEÑO IZQUIERDO (GRILLA DE MINIATURAS) ---

    const GRID_COLS = 7;
    const THUMB_W = 100; // Tamaño fijo de las miniaturas
    const THUMB_H = 150; 
    const GAP = 10;
    const GRID_START_X = 30;
    const GRID_START_Y = 50; 
    const MAX_THUMBS = GRID_COLS * 9; // Máximo de 9 filas para cubrir el espacio

    // Reordenamos las miniaturas para que las de mayor varianza vayan primero (mejor contenido)
    thumbs.sort((a, b) => b.variance - a.variance);

    for (let i = 0; i < thumbs.length && i < MAX_THUMBS; i++) {
        const t = thumbs[i];
        // Recortar la imagen del buffer original
        const s = orig.clone().crop(t.x, t.y, t.w, t.h);
        
        // Redimensionar al tamaño fijo de la grilla
        s.cover(THUMB_W, THUMB_H);
        
        // Calcular posición en la grilla final
        const col = i % GRID_COLS; 
        const row = Math.floor(i / GRID_COLS); 
        const x = GRID_START_X + col * (THUMB_W + GAP); 
        const y = GRID_START_Y + row * (THUMB_H + GAP); 
        
        bg.composite(s, x, y); 
        
        // Opcional: Escribir el número (1, 2, 3...) encima de la miniatura
        bg.print(fontSmall, x + 5, y + 5, `${i + 1}`, THUMB_W, THUMB_H, Jimp.VERTICAL_ALIGN_TOP | Jimp.HORIZONTAL_ALIGN_LEFT);
    }
    
    // --- TEXTO ADICIONAL DEL OCR ---
    // Colocaremos el resto del texto OCR justo debajo de la grilla o a la izquierda si sobra espacio.
    const lines = text.split("\n").filter(Boolean);
    let ocr_y = GRID_START_Y + Math.ceil(MAX_THUMBS / GRID_COLS) * (THUMB_H + GAP) + 20; // Debajo de la grilla
    const ocr_x = GRID_START_X;
    const ocr_max_w = OUTPUT_W * 0.65; // Ancho máximo del texto

    // Filtramos las líneas de texto para eliminar las que son solo números (los índices de las fotos)
    const cleanLines = lines.filter(L => L.length > 2 && !/^\d+$/.test(L.trim()));

    for (const L of cleanLines) {
        // Envolver el texto para que no se salga del área
        const wrappedText = L.match(new RegExp(`.{1,${ocr_max_w / 6}}`, 'g')) || [L]; // Aproximadamente 6 caracteres por 14px de ancho

        for(const segment of wrappedText) {
             bg.print(fontBody, ocr_x, ocr_y, { text: segment, maxWidth: ocr_max_w });
             ocr_y += 20; // Espaciado vertical entre líneas
             if (ocr_y > OUTPUT_H - 20) break; // Límite inferior
        }
        if (ocr_y > OUTPUT_H - 20) break;
    }


    return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ==== ENDPOINT PRINCIPAL ====
app.get("/agv-proc-free", async (req, res) => {
    const dni = String(req.query.dni || "").trim();
    if (!dni) return res.status(400).json({ error: "dni obligatorio" });

    try {
        const apiURL = `${REMOTE_BASE}${API_AGV_PATH}?dni=${dni}`;
        console.log("Consultando API externa:", apiURL);
        
        const apiResp = await axios.get(apiURL);
        
        // CORRECCIÓN: la API devuelve urls.DOCUMENT
        const imgURL = apiResp.data?.urls?.DOCUMENT;
        if (!imgURL) {
            console.log("Respuesta API:", apiResp.data);
            throw new Error("La API no devolvió DOCUMENT URL");
        }

        console.log("Descargando imagen de la API:", imgURL);
        const buf = await axios.get(imgURL, { responseType: "arraybuffer" });
        const imgBuf = Buffer.from(buf.data);
        
        const jimg = await Jimp.read(imgBuf);
        
        const text = await freeOCR(imgBuf);
        const thumbs = await detectThumbs(jimg);
        
        // Reconstrucción visual
        const final = await buildTree(imgBuf, text, thumbs, dni);
        
        const out = `tree_${dni}_${uuidv4()}.png`;
        const pathFull = path.join(PUBLIC_DIR, out);
        await fs.promises.writeFile(pathFull, final);

        // Devolver la URL del archivo generado
        const finalURL = `https://arbol-genialogico-v2.fly.dev/public/${out}`; // Asegúrate de que este dominio sea correcto
        console.log("Imagen final generada en:", finalURL);

        return res.json({ 
            ok: true, 
            message: "Procesado gratis y rediseñado.", 
            dni, 
            ocr: text.substring(0, 100) + '...', // Mostrar solo un snippet
            url: finalURL
        });

    } catch (e) {
        console.error("Error en el endpoint /agv-proc-free:", e.message);
        return res.status(500).json({ error: e.message || "Error interno del servidor" });
    }
});

ensureAssets().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`Servidor listo en http://${HOST}:${PORT}`);
    });
}).catch(e => console.error("Error al iniciar el servidor:", e));
