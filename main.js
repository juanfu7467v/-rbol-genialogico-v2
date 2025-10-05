/**
 * main.js
 * Árbol Genealógico con OCR (Google Cloud Vision)
 * Reconstruye imágenes al estilo "Consulta PE"
 */

const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const vision = require("@google-cloud/vision");

// --- CONFIGURACIÓN PRINCIPAL ---
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// --- CONFIG APP ---
const REMOTE_BASE = "https://web-production-75681.up.railway.app";
const API_AGV_PATH = "/agv";
const GRID_COLS = 7;
const GRID_ROWS = 5;
const THUMB_MIN_VARIANCE = 800;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

axios.defaults.timeout = 60000;

const BG_PATH = path.join(PUBLIC_DIR, "bg.png");
const LOGO_PATH = path.join(PUBLIC_DIR, "logo.png");

const BG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj9IP9iQ133jhNCt9i77y-Cyq2Jqj6HEc29WF2m0sIT6WLgWgNTdRf1HGP7F-YvytM2nJqHltafjTCwza4SlkJhZoNsaxyszIWKDYdDmTSfK_uLTyVUyaX9bUJicbsQK3aIciMcKg6yv_nOzKm3CMFvdMk3yIgcjCbqAKaOpe7U7gX9KcGJDoN58hO7VK8x/s1280/1000026837.jpg";
const LOGO_URL = "https://img.utdstc.com/icon/931/722/9317221e8277cdfa4d3cf2891090ef5e83412768564665bedebb03f8f86dc5ae:200";

// --- DESCARGA INICIAL DE ASSETS ---
async function downloadBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}

async function ensureAssets() {
  try {
    if (!fs.existsSync(BG_PATH)) {
      const buf = await downloadBuffer(BG_URL);
      await fs.promises.writeFile(BG_PATH, buf);
      console.log("✅ Fondo descargado correctamente.");
    }
    if (!fs.existsSync(LOGO_PATH)) {
      const buf = await downloadBuffer(LOGO_URL);
      await fs.promises.writeFile(LOGO_PATH, buf);
      console.log("✅ Logo descargado correctamente.");
    }
  } catch (err) {
    console.error("⚠️ Error descargando imágenes:", err.message);
  }
}

app.use("/public", express.static(PUBLIC_DIR));

// --- FUNCIÓN OCR GOOGLE CLOUD ---
async function doOCRBuffer(buffer) {
  try {
    const keyPath = path.join(__dirname, "vision-key.json");
    if (!fs.existsSync(keyPath)) throw new Error("Archivo vision-key.json no encontrado");

    const client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });
    const [result] = await client.textDetection({ image: { content: buffer } });
    const detections = result.textAnnotations;
    const text = detections.length ? detections[0].description : "";
    return text.trim();
  } catch (e) {
    console.error("❌ OCR error:", e.message);
    return "";
  }
}

// --- DETECTAR MINIATURAS ---
async function detectThumbnailsFromImage(jimpImage) {
  const w = jimpImage.bitmap.width;
  const h = jimpImage.bitmap.height;
  const cellW = Math.floor(w / GRID_COLS);
  const cellH = Math.floor(h / GRID_ROWS);
  const candidates = [];

  for (let ry = 0; ry < GRID_ROWS; ry++) {
    for (let cx = 0; cx < GRID_COLS; cx++) {
      const x = cx * cellW;
      const y = ry * cellH;
      const clone = jimpImage.clone().crop(x, y, cellW, cellH);

      let sum = 0, sum2 = 0, n = 0;
      clone.scan(0, 0, clone.bitmap.width, clone.bitmap.height, function (xx, yy, idx) {
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        sum += lum; sum2 += lum * lum; n++;
      });

      const mean = sum / n;
      const variance = sum2 / n - mean * mean;
      if (variance >= THUMB_MIN_VARIANCE) {
        candidates.push({ x, y, w: cellW, h: cellH, variance });
      }
    }
  }

  candidates.sort((a, b) => b.variance - a.variance);
  return candidates;
}

// --- FUNCIONES DE IMPRESIÓN ---
function printWrappedJimp(image, font, x, y, maxWidth, text, lineHeight = 26) {
  const words = text.split(/\s+/);
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = Jimp.measureText(font, test);
    if (width > maxWidth && line) {
      image.print(font, x, curY, line);
      curY += lineHeight;
      line = w;
    } else line = test;
  }
  if (line) image.print(font, x, curY, line);
  return curY + lineHeight;
}

// --- CONSTRUCCIÓN FINAL ---
async function buildRebrandedImage(originalBuffer, ocrText, thumbs, dni) {
  let bg;
  try {
    bg = fs.existsSync(BG_PATH)
      ? await Jimp.read(BG_PATH)
      : new Jimp(OUTPUT_WIDTH, OUTPUT_HEIGHT, "#092230");
  } catch {
    bg = new Jimp(OUTPUT_WIDTH, OUTPUT_HEIGHT, "#092230");
  }

  bg.resize(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontH = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  // Logo
  if (fs.existsSync(LOGO_PATH)) {
    try {
      const logo = await Jimp.read(LOGO_PATH);
      logo.resize(220, Jimp.AUTO);
      bg.composite(logo, OUTPUT_WIDTH - logo.bitmap.width - 36, 30);
    } catch { }
  }

  bg.print(fontTitle, 48, 40, `ÁRBOL GENEALÓGICO - ${dni}`);

  const textX = 48;
  const textWidth = Math.floor(OUTPUT_WIDTH * 0.52) - 96;
  const thumbsX = Math.floor(OUTPUT_WIDTH * 0.52) + 16;
  const thumbsWidth = OUTPUT_WIDTH - thumbsX - 48;

  const colCount = 3;
  const gap = 12;
  const thumbW = Math.floor((thumbsWidth - (colCount - 1) * gap) / colCount);

  for (let i = 0; i < Math.min(thumbs.length, 30); i++) {
    try {
      const orig = await Jimp.read(originalBuffer);
      const t = thumbs[i];
      const crop = orig.clone().crop(t.x, t.y, t.w, t.h);
      crop.cover(thumbW, Math.floor((t.h / t.w) * thumbW));
      const col = i % colCount;
      const row = Math.floor(i / colCount);
      const x = thumbsX + col * (thumbW + gap);
      const y = 150 + row * (Math.floor(thumbW * 1.05) + gap);
      bg.composite(crop, x, y);
    } catch { }
  }

  const lines = ocrText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let leftY = 150;
  const colGap = 24;
  const cols = 2;
  const colW = Math.floor((textWidth - colGap) / cols);
  let colIdx = 0;

  for (const line of lines) {
    const xCol = textX + colIdx * (colW + colGap);
    leftY = printWrappedJimp(bg, fontData, xCol, leftY, colW, line, 26);
    if (leftY > OUTPUT_HEIGHT - 300) {
      leftY = 150;
      colIdx++;
      if (colIdx >= cols) break;
    }
  }

  bg.print(fontH, textX, OUTPUT_HEIGHT - 140, "Consulta PE • Información reconstruida");
  bg.print(fontData, textX, OUTPUT_HEIGHT - 100, "Generado automáticamente. No es documento oficial.");

  return bg.getBufferAsync(Jimp.MIME_PNG);
}

// --- ENDPOINT PRINCIPAL ---
app.get("/agv-proc", async (req, res) => {
  const dni = String(req.query.dni || "").trim();
  if (!dni || !/^\d{6,}$/i.test(dni)) {
    return res.status(400).json({ error: "Parámetro dni inválido. Ej: ?dni=10001088" });
  }

  try {
    const agvUrl = `${REMOTE_BASE}${API_AGV_PATH}?dni=${encodeURIComponent(dni)}`;
    console.log("🔍 Consultando:", agvUrl);

    const apiResp = await axios.get(agvUrl, { timeout: 60000 });
    if (!apiResp.data?.urls?.FILE) throw new Error("La API agv no devolvió urls.FILE");

    const imageBuffer = await downloadBuffer(apiResp.data.urls.FILE);
    const ocrText = await doOCRBuffer(imageBuffer);
    const jimpOrig = await Jimp.read(imageBuffer);
    const thumbs = await detectThumbnailsFromImage(jimpOrig);
    const newImgBuffer = await buildRebrandedImage(imageBuffer, ocrText, thumbs, dni);

    const outName = `agv_rebrand_${dni}_${uuidv4()}.png`;
    const outPath = path.join(PUBLIC_DIR, outName);
    await fs.promises.writeFile(outPath, newImgBuffer);

    return res.json({
      bot: "@CONSULTA_PE_BOT",
      date: new Date().toISOString(),
      fields: { dni },
      message: ocrText || `Imagen procesada para DNI ${dni}`,
      urls: { FILE: `${req.protocol}://${req.get("host")}/public/${outName}` }
    });

  } catch (error) {
    console.error("❌ Error en /agv-proc:", error);
    return res.status(500).json({
      error: "Error procesando imagen",
      detalle: error.message || String(error)
    });
  }
});

// --- ENDPOINT DE ESTADO ---
app.get("/status", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- INICIO DEL SERVIDOR ---
ensureAssets().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor activo en http://${HOST}:${PORT}`);
  });
}).catch(err => {
  console.error("Error inicializando assets:", err.message);
});
