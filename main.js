/**
 * main.js – Árbol genealógico GRATIS (sin Google Vision)
 *
 * OCR con Tesseract + reconstrucción personalizada
 *
 * NOTA: Este código ha sido adaptado. La función freeOCR solo devuelve el texto,
 * NO un JSON limpio con los nombres de las 52 personas.
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
// Usaremos la imagen provista para simular la descarga
const EXAMPLE_IMG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhinBHvbtHY2piKZ_DU6UDvmS4rujMacF6Me5bFXkNjCR_yiF4XMWcIGjrXHxJbE8Lb2yrYmkbo_2dBQlNdImTStPgQPcKVaKEdTjnHg06ZBuS1eAQUr8jzBOxRc8WEzsHT2Kpio6o-7gLPaJ6vZvK4u7euXXWth9XPs_3ZXLsVpBx1BLTYXT1MPm9kic51/s3000/1000039235.png";
const BG_URL = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhinBHvbtHY2piKZ_DU6UDvmS4rujMacF6Me5bFXkNjCR_yiF4XMWcIGjrXHxJbE8Lb2yrYmkbo_2dBQlNdImTStPgQPcKVaKEdTjnHg06ZBuS1eAQUr8jzBOxRc8WEzsHT2Kpio6o-7gLPaJ6vZvK4u7euXXWth9XPs_3ZXLsVpBx1BLTYXT1MPm9kic51/s3000/1000039235.png"; // Usando la misma URL de fondo por simplicidad

const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const BG_PATH = path.join(PUBLIC_DIR, "bg.png");

axios.defaults.timeout = 60000;

// === SERVIR ARCHIVOS ESTÁTICOS (CORRECCIÓN CLAVE) ===
app.use("/public", express.static(PUBLIC_DIR));

// Descargar fondo si no existe
async function ensureAssets() {
  if (!fs.existsSync(BG_PATH)) {
    try {
      const buf = await axios.get(BG_URL, { responseType: "arraybuffer" });
      await fs.promises.writeFile(BG_PATH, Buffer.from(buf.data));
      console.log("Fondo nuevo guardado");
    } catch (error) {
      console.error("Error al descargar el fondo:", error.message);
      // Crear un fondo temporal en caso de fallo
      await new Jimp(1080, 1920, 0x000000FF, (err, image) => {
        if (err) throw err;
        image.write(BG_PATH);
      });
      console.log("Fondo predeterminado negro creado.");
    }
  }
}

// ==== OCR GRATIS ====
async function freeOCR(buffer) {
  try {
    // Usamos el idioma 'spa' para español
    const result = await Tesseract.recognize(buffer, "spa", {
      logger: (m) => {
        // console.log(m); // Descomentar para ver el progreso del OCR
      },
    });
    return result.data.text.trim();
  } catch (e) {
    console.error("OCR error:", e);
    return "";
  }
}

// ==== Detectar miniaturas (Lógica de tu código) ====
async function detectThumbs(img) {
  const GRID_COLS = 7;
  const GRID_ROWS = 7; // Aumentado a 7 para capturar más filas
  const THRESH = 800;

  const W = img.bitmap.width;
  const H = img.bitmap.height;

  // Ajuste para el árbol de la imagen, que es más largo que 5 filas
  const cropAreaHeight = H * 0.9;
  const cw = Math.floor(W / GRID_COLS);
  const ch = Math.floor(cropAreaHeight / GRID_ROWS);

  const thumbs = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const crop = img.clone().crop(c * cw, r * ch, cw, ch);

      let sum = 0,
        sum2 = 0,
        n = 0;
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

      // Un umbral más bajo puede capturar más áreas, un umbral alto
      // (como el 800 original) es más selectivo.
      if (variance >= THRESH) {
        thumbs.push({ x: c * cw, y: r * ch, w: cw, h: ch, variance });
      }
    }
  }

  // Ordenar para tomar los más probables
  return thumbs.sort((a, b) => b.variance - a.variance);
}

// ==== Construir imagen final (Lógica de tu código) ====
async function buildTree(buffer, text, thumbs, dni) {
  const OUTPUT_W = 1080;
  const OUTPUT_H = 1920;

  const bg = await Jimp.read(BG_PATH);
  bg.resize(OUTPUT_W, OUTPUT_H);

  // Intentar cargar fuentes, usar una predeterminada si falla
  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE).catch(() => Jimp.loadFont(Jimp.FONT_SANS_32_WHITE));
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE).catch(() => Jimp.loadFont(Jimp.FONT_SANS_8_WHITE));

  // CORRECCIÓN DE ERROR: La variable del título no estaba bien concatenada
  bg.print(fontTitle, 40, 40, `ÁRBOL GENEALÓGICO - ${dni}`);

  const orig = await Jimp.read(buffer);

  // Variables para la cuadrícula
  const colCount = 3;
  const gap = 12;
  const baseX = 580; // Posición de inicio de las miniaturas
  const startY = 180;

  // Componer las miniaturas detectadas
  for (let i = 0; i < thumbs.length && i < 30; i++) {
    const t = thumbs[i];
    const s = orig.clone().crop(t.x, t.y, t.w, t.h);
    const w = 180;
    s.cover(w, w);

    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const x = baseX + col * (w + gap);
    const y = startY + row * (w + gap);
    bg.composite(s, x, y);
  }

  // Escribir el resultado del OCR
  const lines = text.split("\n").filter(Boolean);
  let y = startY;

  for (const L of lines) {
    bg.print(fontSmall, 40, y, L);
    y += 26;
    if (y > OUTPUT_H - 200) break;
  }

  return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ==== ENDPOINT PRINCIPAL (ADAPTADO para usar la imagen de ejemplo) ====
app.get("/agv-proc-free", async (req, res) => {
  const dni = String(req.query.dni || "EJEMPLO_DNI").trim();
  // El DNI es obligatorio solo si se conecta a una API. Aquí lo hacemos opcional
  // para demostrar el OCR con la imagen de ejemplo.

  try {
    // SIMULACIÓN: Descargar la imagen de ejemplo (la URL que se usaría si viniera de una API)
    const imgResp = await axios.get(EXAMPLE_IMG_URL, { responseType: "arraybuffer" });
    const imgBuf = Buffer.from(imgResp.data);

    // 1. OCR
    const text = await freeOCR(imgBuf);

    // 2. Procesamiento de imagen
    const jimg = await Jimp.read(imgBuf);
    const thumbs = await detectThumbs(jimg);

    // 3. Reconstrucción
    const final = await buildTree(imgBuf, text, thumbs, dni);

    // 4. Guardar y devolver URL
    const out = `tree_${dni}_${uuidv4()}.png`;
    const pathFull = path.join(PUBLIC_DIR, out);
    await fs.promises.writeFile(pathFull, final);

    // Devolver el resultado del OCR
    return res.json({
      ok: true,
      message: "Procesado gratis - El OCR completo se encuentra en el campo 'ocr'",
      dni: dni,
      ocr: text, // ¡Aquí está todo el texto detectado!
      url: `https://${req.headers.host}/public/${out}`,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Error desconocido en el procesamiento." });
  }
});

// ==== INICIO DEL SERVIDOR ====
ensureAssets().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Servidor listo en http://${HOST}:${PORT}`);
    console.log(`Endpoint de prueba: http://${HOST}:${PORT}/agv-proc-free?dni=73524332`);
  });
});
