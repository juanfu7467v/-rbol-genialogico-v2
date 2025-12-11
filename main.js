/**
 * main.js – Árbol genealógico con fondo personalizado (sin reconstrucción compleja)
 *
 * Estrategia: Descargar la imagen de la API (mockup), superponer el fondo
 * personalizado (azul/rojo) en la parte superior, y añadir los textos fijos
 * de la API y las leyendas que fueron eliminadas con el cambio de fondo.
 */

const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// ==== CONFIG ====
// URL base de la API externa
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
        try {
            const buf = await axios.get(BG_URL, { responseType: "arraybuffer" });
            await fs.promises.writeFile(BG_PATH, Buffer.from(buf.data));
            console.log("Fondo nuevo guardado");
        } catch (error) {
            console.error("Error al descargar el fondo:", error.message);
            // Crear un fondo de respaldo si falla la descarga
            const dummyBg = new Jimp(1080, 1920, 0x1a237eFF); // Azul oscuro
            await dummyBg.writeAsync(BG_PATH);
        }
    }
}

// ==== CONSTRUCCIÓN DE LA IMAGEN FINAL (SOLUCIÓN CLAVE) ====
async function buildFinalImage(imgBuf, dni) {
    const OUTPUT_W = 1080;
    const OUTPUT_H = 1920;

    // 1. Cargar el fondo azul/rojo y el mockup de la API
    const bg = await Jimp.read(BG_PATH);
    bg.resize(OUTPUT_W, OUTPUT_H);

    const mockup = await Jimp.read(imgBuf);
    mockup.resize(OUTPUT_W, OUTPUT_H);

    // 2. Definir las fuentes
    // Estas fuentes no están disponibles localmente, Jimp las cargará por URL
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK); // Título
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK); // Pequeño

    // 3. Superponer el mockup sobre el fondo personalizado.
    // El mockup de la API ya contiene TODA la estructura visual deseada (cuadrícula,
    // foto principal, título, texto).
    // Solo necesitamos enmascarar la zona de degradado del mockup original (blanco/gris claro)
    // y dejar visible el fondo azul/rojo.

    // Calculamos una zona de corte que mantenga el diseño del árbol
    // pero reemplace la zona superior (el degradado del mockup original)
    // Un valor estimado (depende de la imagen, pero 180px parece una buena zona de inicio)
    const MOCKUP_Y_START = 180;
    const MOCKUP_HEIGHT = OUTPUT_H - MOCKUP_Y_START;

    const mockupCrop = mockup.clone().crop(0, MOCKUP_Y_START, OUTPUT_W, MOCKUP_HEIGHT);

    // Componer: El fondo azul/rojo es la base. Le añadimos el cuerpo del árbol genealógico.
    bg.composite(mockupCrop, 0, MOCKUP_Y_START);

    // 4. Re-añadir el Título (si queremos asegurarnos que es blanco)
    // Asumiendo que el título en el fondo azul es "ÁRBOL GENEALÓGICO - 73622432"
    // Usaremos una fuente blanca para que destaque sobre el fondo oscuro/rojo
    const fontTitleWhite = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    bg.print(fontTitleWhite, 40, 40, `ÁRBOL GENEALÓGICO - ${dni}`);


    // 5. Re-añadir las leyendas inferiores (que el cambio de fondo pudo haber oscurecido/eliminado)
    // Extrayendo coordenadas aproximadas de la imagen original (tercera imagen subida)
    const leyendas = [
        `CANTIDAD DE\nFAMILIARES: 52`,
        `Familiares Paternos`,
        `Familiares Maternos`,
        `Encuentranos en Telegram:\n@LEDERDATAGRUPO`,
        `Consulta pe apk`
    ];

    const FONT_WHITE = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    
    // Posicionamiento de las leyendas para que se parezcan al mockup
    bg.print(FONT_WHITE, 700, 240, leyendas[0], 300, 100); // Cantidad de Familiares
    bg.print(FONT_WHITE, 700, 360, leyendas[1]); // Familiares Paternos
    bg.print(FONT_WHITE, 700, 390, leyendas[2]); // Familiares Maternos

    bg.print(FONT_WHITE, 700, 1750, leyendas[3]); // Telegram
    bg.print(FONT_WHITE, 40, 1750, leyendas[4]); // Consulta pe apk

    // Opcional: Si deseas agregar el texto OCR que extrajiste (datos sin formato) en la izquierda:
    /*
    const text_data = 'EIEI e RBOR...\n...La eee 15 y='; // Tu texto OCR aquí
    const fontSmallWhite = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    bg.print(fontSmallWhite, 40, 220, text_data, 500, 1500);
    */
    
    return bg.getBufferAsync(Jimp.MIME_PNG);
}

// ==== ENDPOINT PRINCIPAL CORREGIDO ====
app.get("/agv-proc-free", async (req, res) => {
    const dni = String(req.query.dni || "").trim();
    if (!dni) return res.status(400).json({ error: "dni obligatorio" });

    try {
        const apiURL = `${REMOTE_BASE}${API_AGV_PATH}?dni=${dni}`;
        const apiResp = await axios.get(apiURL);

        // La API devuelve urls.DOCUMENT
        const imgURL = apiResp.data?.urls?.DOCUMENT;
        if (!imgURL) {
            console.log("Respuesta API:", apiResp.data);
            throw new Error("La API no devolvió DOCUMENT");
        }

        // Descargar la imagen (el mockup)
        const buf = await axios.get(imgURL, { responseType: "arraybuffer" });
        const imgBuf = Buffer.from(buf.data);

        // Construir la imagen final con el fondo personalizado
        const final = await buildFinalImage(imgBuf, dni);

        const out = `tree_${dni}_${uuidv4()}.png`;
        const pathFull = path.join(PUBLIC_DIR, out);
        await fs.promises.writeFile(pathFull, final);

        return res.json({ 
            ok: true, 
            message: "Procesado con fondo personalizado (copia de estructura visual)", 
            dni, 
            url: `https://arbol-genialogico-v2.fly.dev/public/${out}` 
        }); 

    } catch (e) {
        console.error("Error en la ruta /agv-proc-free:", e);
        return res.status(500).json({ error: e.message || "Error desconocido" });
    }
});

// ==== INICIAR SERVIDOR ====
ensureAssets().then(() => {
    app.listen(PORT, HOST, () => {
        console.log(`Servidor listo en http://${HOST}:${PORT}`);
    });
});
