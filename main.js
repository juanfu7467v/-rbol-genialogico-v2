/**
 * main.js – Árbol genealógico a JSON (sin reconstrucción visual)
 * * OCR con Tesseract + procesamiento de texto y análisis de miniaturas.
 * Extrae datos de la imagen del árbol genealógico y devuelve JSON limpio.
 */

const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const Tesseract = require("tesseract.js");
const { v4: uuidv4 } = require("uuid"); // Aunque no se usa para generar la imagen, se mantiene por si acaso.
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// ==== CONFIG ====
const REMOTE_BASE = "https://web-production-75681.up.railway.app";
const API_AGV_PATH = "/agv";

// Directorio para guardar miniaturas extraídas (opcional, para verificación)
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

axios.defaults.timeout = 60000;

// === SERVIR ARCHIVOS ESTÁTICOS (para miniaturas si se desea) ===
app.use("/public", express.static(PUBLIC_DIR));

// ==== OCR GRATIS ====
async function freeOCR(buffer) {
    try {
        // Mejorar la calidad del OCR con un escalado previo
        const jimg = await Jimp.read(buffer);
        // Escalar la imagen para mejor reconocimiento de texto pequeño
        jimg.scale(2, Jimp.RESIZE_BILINEAR); 
        const scaledBuffer = await jimg.getBufferAsync(Jimp.MIME_PNG);

        const result = await Tesseract.recognize(scaledBuffer, "spa", {
            logger: () => {}
        });
        return result.data.text.trim();
    } catch (e) {
        console.error("OCR error:", e);
        return "";
    }
}

// ==== Procesar texto OCR y estructurar datos ====
function processOCRText(ocrText, dniConsulta) {
    const lines = ocrText.split("\n").map(l => l.trim()).filter(Boolean);
    const data = {
        dni: dniConsulta,
        nombre: null,
        apellidos: null,
        edad: null,
        foto_url: `https://arbol-genialogico-v2.fly.dev/public/${dniConsulta}.jpg`, // URL base para la foto principal
        familiares: {
            total: 0,
            paternos: 0,
            maternos: 0
        },
        lista_familiares: []
    };

    const regexFamiliar = /^\d+\s*([\d\s]+)\s*([\w\s,]+)\s*(?:(\d{1,2})\s*años\s*)?(M|F)?\s*(\w+)\s*(\w+)/i;
    const regexDNIPrincipal = new RegExp(`${dniConsulta}\\s*([\\w\\s,]+)\\s*(\\d{1,2})\\s*años`, 'i');
    
    // Regex para extraer cantidad de familiares (parte derecha de la imagen)
    const regexCantidad = /CANTIDAD DE FAMILIARES: (\d+)\s*Familiares Paternos: (\d+)\s*Familiares Maternos: (\d+)/i;

    let foundDNIPrincipal = false;

    for (const line of lines) {
        // 1. Extraer datos de la persona consultada
        if (!foundDNIPrincipal) {
            const matchPrincipal = line.match(regexDNIPrincipal);
            if (matchPrincipal) {
                // El OCR a veces confunde el DNI principal o está en un formato específico
                const nombreApellido = matchPrincipal[1].trim();
                const partes = nombreApellido.split(/\s+/);
                data.nombre = partes.shift() || 'Desconocido';
                data.apellidos = partes.join(' ') || 'Desconocido';
                data.edad = parseInt(matchPrincipal[2], 10) || null;
                foundDNIPrincipal = true;
                continue;
            }
        }
        
        // 2. Extraer datos de los familiares
        // El formato en las tarjetas es (Número de orden) DNI Nombre/Apellido/Edad/Sexo/Tipo/Rama
        // Buscamos un patrón que empiece con un número de orden y luego el DNI.
        const matchFamiliar = line.match(regexFamiliar);
        
        if (matchFamiliar) {
            // Eliminar espacios en el DNI
            const dniFamiliar = matchFamiliar[1].replace(/\s/g, ''); 
            // Limpiar y separar nombre y apellidos
            const nombreApellido = matchFamiliar[2].trim().split(/\s*,\s*|\s+/); 
            const nombre = nombreApellido.shift() || 'Desconocido';
            const apellidos = nombreApellido.join(' ') || 'Desconocido';
            
            // Los siguientes campos pueden ser inconsistentes o faltar en el OCR
            const edadFamiliar = parseInt(matchFamiliar[3], 10) || null;
            const sexo = (matchFamiliar[4] || 'U').toUpperCase();
            const tipoFamiliar = matchFamiliar[5].trim();
            const rama = (matchFamiliar[6] || '').toLowerCase().includes('mat') ? 'materna' : 'paterna';

            if (dniFamiliar.length >= 7) { // Heurística: asegurar que el DNI sea válido
                data.lista_familiares.push({
                    dni: dniFamiliar,
                    nombre: nombre,
                    apellidos: apellidos,
                    edad: edadFamiliar,
                    sexo: sexo,
                    tipo_familiar: tipoFamiliar,
                    rama: rama,
                    verificacion: 'ALTA',
                    foto_url: `https://arbol-genialogico-v2.fly.dev/public/${dniFamiliar}.jpg`
                });
            }
            continue;
        }

        // 3. Extraer totales (parte derecha)
        const matchCantidad = line.match(regexCantidad);
        if (matchCantidad) {
            data.familiares.total = parseInt(matchCantidad[1], 10) || 0;
            data.familiares.paternos = parseInt(matchCantidad[2], 10) || 0;
            data.familiares.maternos = parseInt(matchCantidad[3], 10) || 0;
        }
    }
    
    // Si no se encontró la cantidad con regex, se usa el conteo de la lista
    if (data.familiares.total === 0 && data.lista_familiares.length > 0) {
        data.familiares.total = data.lista_familiares.length;
        data.familiares.paternos = data.lista_familiares.filter(f => f.rama === 'paterna').length;
        data.familiares.maternos = data.lista_familiares.filter(f => f.rama === 'materna').length;
    }

    return data;
}

// ==== Extraer y guardar miniaturas de la imagen original ====
async function extractAndSaveThumbnails(jimg, familiares) {
    const W = jimg.bitmap.width;
    const H = jimg.bitmap.height;
    const numCards = 35; // Hay aproximadamente 35-40 tarjetas principales
    
    // Aproximar el tamaño de la tarjeta (la imagen tiene ~7 columnas x 5 filas de tarjetas principales)
    const CARD_W = Math.floor(W / 7.5);
    const CARD_H = Math.floor(H / 6.5);

    // Tamaño de la miniatura dentro de la tarjeta
    const THUMB_SIZE = 100; 

    // Heurística de posición de la miniatura (asumimos que está en la parte superior central de cada tarjeta)
    for (let i = 0; i < numCards; i++) {
        // Posición aproximada de la tarjeta (índice 0 a 34)
        const c = i % 7;
        const r = Math.floor(i / 7);
        
        // Coordenadas aproximadas de la tarjeta
        const cardX = Math.floor(c * CARD_W);
        const cardY = Math.floor(r * CARD_H);

        // Coordenadas de la miniatura (parte superior de la tarjeta)
        const thumbX = cardX + Math.floor(CARD_W * 0.1); 
        const thumbY = cardY + Math.floor(CARD_H * 0.05); 
        const cropW = Math.floor(CARD_W * 0.8);
        const cropH = Math.floor(CARD_H * 0.5);

        try {
            const thumbCrop = jimg.clone().crop(thumbX, thumbY, cropW, cropH);
            thumbCrop.cover(THUMB_SIZE, THUMB_SIZE);

            // Búsqueda aproximada del DNI asociado
            // Aquí se usaría un sistema más robusto, pero para este ejercicio
            // se asocia por orden o por una búsqueda de color/texto más compleja.
            // Para mantener la consistencia con el JSON, se asocia por orden de lista.
            
            let dniToAssociate = null;

            // DNI de la persona consultada (la más grande a la derecha, pos 35)
            if (i === 35) { 
                dniToAssociate = familiares.dni;
            } else if (i < familiares.lista_familiares.length) {
                // Asociar con los familiares por orden de aparición
                dniToAssociate = familiares.lista_familiares[i].dni;
            }

            if (dniToAssociate) {
                const outPath = path.join(PUBLIC_DIR, `${dniToAssociate}.jpg`);
                await thumbCrop.quality(90).writeAsync(outPath);
                console.log(`Miniatura guardada para DNI: ${dniToAssociate}`);
            }

        } catch (e) {
            console.warn(`No se pudo extraer la miniatura ${i}: ${e.message}`);
        }
    }
}


// ==== ENDPOINT PRINCIPAL (MODIFICADO) ====
app.get("/agv-proc-free", async (req, res) => {
    const dni = String(req.query.dni || "").trim();
    if (!dni) return res.status(400).json({ error: "dni obligatorio" });

    try {
        // 1. Obtener la URL de la imagen del árbol genealógico
        const apiURL = `${REMOTE_BASE}${API_AGV_PATH}?dni=${dni}`;
        const apiResp = await axios.get(apiURL);

        const imgURL = apiResp.data?.urls?.DOCUMENT;
        if (!imgURL) {
            console.log("Respuesta API:", apiResp.data);
            throw new Error("La API no devolvió una URL DOCUMENT de imagen");
        }

        // 2. Descargar la imagen
        const buf = await axios.get(imgURL, { responseType: "arraybuffer" });
        const imgBuf = Buffer.from(buf.data);
        const jimg = await Jimp.read(imgBuf);

        // 3. Realizar OCR para extraer todo el texto
        const ocrText = await freeOCR(imgBuf);

        // 4. Procesar el texto OCR y estructurar el JSON
        const jsonData = processOCRText(ocrText, dni);
        
        // 5. Extraer y guardar las miniaturas (para la URL del JSON)
        // Nota: Esta es una HEURÍSTICA DE POSICIÓN. Podría fallar si el layout de la imagen cambia.
        await extractAndSaveThumbnails(jimg, jsonData); 

        // 6. Devolver el JSON limpio y estructurado
        return res.json(jsonData);

    } catch (e) {
        console.error("Error en el endpoint /agv-proc-free:", e.message);
        // Si el error es de Tesseract o de la URL, devolver un error 500
        return res.status(500).json({ 
            error: "Error interno en el procesamiento OCR/JSON.", 
            detalle: e.message 
        });
    }
});


app.listen(PORT, HOST, () => {
    console.log(`Servidor listo. Escuchando en http://${HOST}:${PORT}`);
});
