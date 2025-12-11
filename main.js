/**
 * main.js – Árbol genealógico GRATIS (sin Google Vision)
 * OCR con Tesseract + reconstrucción personalizada
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

// Fondo personalizado
const BG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhinBHvbtHY2piKZ_DU6UDvmS4rujMacF6Me5bFXkNjCR_yiF4XMWcIGjrXHxJbE8Lb2yrYmkbo_2dBQlNdImTStPgQPcKVaKEdTjnHg06ZBuS1eAQUr8jzBOxRc8WEzsHT2Kpio6o-7gLPaJ6vZvK4u7euXXWth9XPs_3ZXLsVpBx1BLTYXT1MPm9kic51/s3000/1000039235.png";

axios.defaults.timeout = 60000;

// === SERVIR ARCHIVOS ESTÁTICOS (CORRECCIÓN CLAVE) ===
app.use("/public", express.static(PUBLIC_DIR));

// Descargar fondo si no existe
async function ensureAssets() {
  if (!fs.existsSync(BG_PATH)) {
    const buf = await axios.get(BG_URL, { responseType: "arraybuffer" });
    await fs.promises.writeFile(BG_PATH, Buffer.from(buf.data));
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

// ==== Detectar miniaturas ====
async function detectThumbs(img) {
  const GRID_COLS = 7;
  const GRID_ROWS = 5;
  const THRESH = 800;

  const W = img.bitmap.width;
  const H = img.bitmap.height;

  const cw = Math.floor(W / GRID_COLS);
  const ch = Math.floor(H / GRID_ROWS);

  const thumbs = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const crop = img.clone().crop(c * cw, r * ch, cw, ch);

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

      if (variance >= THRESH) thumbs.push({ x: c * cw, y: r * ch, w: cw, h: ch, variance });
    }
  }

  return thumbs.sort((a, b) => b.variance - a.variance);
}

// ==== Construir imagen final ====
async function buildTree(buffer, text, thumbs, dni) {
  const OUTPUT_W = 1080;
  const OUTPUT_H = 1920;

  const bg = await Jimp.read(BG_PATH);
  bg.resize(OUTPUT_W, OUTPUT_H);

  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  bg.print(fontTitle, 40, 40, `ÁRBOL GENEALÓGICO - ${dni}`);

  const orig = await Jimp.read(buffer);

  const colCount = 3;
  const gap = 12;
  const baseX = 580;

  for (let i = 0; i < thumbs.length && i < 30; i++) {
    const t = thumbs[i];
    const s = orig.clone().crop(t.x, t.y, t.w, t.h);
    const w = 180;
    s.cover(w, w);

    const col = i % colCount;
    const row = Math.floor(i / colCount);

    const x = baseX + col * (w + gap);
    const y = 180 + row * (w + gap);

    bg.composite(s, x, y);
  }

  const lines = text.split("\n").filter(Boolean);
  let y = 180;

  for (const L of lines) {
    bg.print(fontSmall, 40, y, L);
    y += 26;
    if (y > OUTPUT_H - 200) break;
  }

  return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ==== ENDPOINT PRINCIPAL ====
app.get("/agv-proc-free", async (req, res) => {
  const dni = String(req.query.dni || "").trim();
  if (!dni) return res.status(400).json({ error: "dni obligatorio" });

  try {
    const apiURL = `${REMOTE_BASE}${API_AGV_PATH}?dni=${dni}`;
    const apiResp = await axios.get(apiURL);

    // CORRECCIÓN: la API devuelve urls.DOCUMENT
    const imgURL = apiResp.data?.urls?.DOCUMENT;

    if (!imgURL) {
      console.log("Respuesta API:", apiResp.data);
      throw new Error("La API no devolvió DOCUMENT");
    }

    const buf = await axios.get(imgURL, { responseType: "arraybuffer" });
    const imgBuf = Buffer.from(buf.data);

    const jimg = await Jimp.read(imgBuf);

    const text = await freeOCR(imgBuf);
    const thumbs = await detectThumbs(jimg);

    const final = await buildTree(imgBuf, text, thumbs, dni);

    const out = `tree_${dni}_${uuidv4()}.png`;
    const pathFull = path.join(PUBLIC_DIR, out);
    await fs.promises.writeFile(pathFull, final);

    return res.json({
      ok: true,
      message: "Procesado gratis",
      dni,
      ocr: text,
      url: `https://arbol-genialogico-v2.fly.dev/public/${out}`
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

ensureAssets().then(() => {
  app.listen(PORT, HOST, () => {
    console.log("Servidor listo.");
  });
});
