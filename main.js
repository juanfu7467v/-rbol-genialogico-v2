/**
 * main.js – Árbol genealógico MODIFICADO para devolver JSON de datos
 *
 * NOTA: Se ha eliminado toda la lógica de Jimp/Tesseract y se
 * devuelve un JSON estático para simular la extracción de datos
 * requerida por el usuario.
 */

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Datos JSON estáticos extraídos de la imagen, simulando el resultado final del proceso.
const staticJsonData = {
  "url_foto_de_la_peraona_que_aparece_sobre_el_dni": "https://arbol-genialogico-v2.fly.dev/public/73622432_carnet.png",
  "datos_principal": {
    "dni": "73622432",
    "edad": "27 AÑOS",
    "origen": "Huarochiri, Lima",
    "cantidad_familiares": 52
  },
  "familiares_total": 52,
  "familiares_paternos": 14,
  "familiares_maternos": 38,
  "familia": [
    { "id": 1, "dni": "27253689-5", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 2, "dni": "27730415-5", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 3, "dni": "27253809-2", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 4, "dni": "27257177-2", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 5, "dni": "27253880-7", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 6, "dni": "33663121-2", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 7, "dni": "45408109-9", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 8, "dni": "70412810-6", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 9, "dni": "42424343-1", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 10, "dni": "43907998-3", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 11, "dni": "43907997-0", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 12, "dni": "45232808-3", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 13, "dni": "46497312-0", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 14, "dni": "46151206-5", "nombre_apellido": "Desconocido", "tipo": "Paterno" },
    { "id": 15, "dni": "46153018-8", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 16, "dni": "42424348-4", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 17, "dni": "45828030-5", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 18, "dni": "70412817-6", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 19, "dni": "70428219-1", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 20, "dni": "75421820-9", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 21, "dni": "43157640-0", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 22, "dni": "42114820-9", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 23, "dni": "27273916-1", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 24, "dni": "61138400-3", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 25, "dni": "42632784-7", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 26, "dni": "45202910-3", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 27, "dni": "46907784-1", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 28, "dni": "71777926-3", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 29, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 30, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 31, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 32, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 33, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 34, "dni": "NO_VISIBLE", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 35, "dni": "42723810-0", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 36, "dni": "60146227-8", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 37, "dni": "91151731-5", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 38, "dni": "70268480-9", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 39, "dni": "52784510-1", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 40, "dni": "42154702-0", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 41, "dni": "40214618-0", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 42, "dni": "48790819-5", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 43, "dni": "40726158-8", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 44, "dni": "40723177-8", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 45, "dni": "62990286-4", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 46, "dni": "66209217-2", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 47, "dni": "71749918-4", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 48, "dni": "75111541-7", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 49, "dni": "44722152-1", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 50, "dni": "48157746-5", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 51, "dni": "48157748-0", "nombre_apellido": "Desconocido", "tipo": "Materno" },
    { "id": 52, "dni": "48157743-3", "nombre_apellido": "Desconocido", "tipo": "Materno" }
  ]
};


// ==== ENDPOINT PRINCIPAL (MODIFICADO) ====
app.get("/agv-proc-free", async (req, res) => {
  const dni = String(req.query.dni || "").trim();
  if (!dni) return res.status(400).json({ error: "dni obligatorio" });

  try {
    // Simulamos la verificación con la API externa si el DNI coincide
    // Si la idea es siempre devolver el JSON de la imagen, independientemente del DNI
    // pasado, se podría hacer simplemente:
    // return res.json({ ok: true, data: staticJsonData });

    // Si queremos que solo funcione para el DNI 73622432 (el de la imagen):
    if (dni !== "73622432") {
      return res.status(404).json({ ok: false, message: `Datos no encontrados para DNI ${dni}. Solo disponible para 73622432.` });
    }

    // Devolvemos el JSON de datos extraído
    return res.json({
      ok: true,
      message: "Extracción de datos completada (simulada)",
      dni: dni,
      data: staticJsonData
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, HOST, () => {
  console.log(`Servidor listo y escuchando en http://${HOST}:${PORT}`);
  console.log(`Para probar: http://localhost:${PORT}/agv-proc-free?dni=73622432`);
});
