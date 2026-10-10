import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceError, validateText } from "../../shared/utils/serviceUtils.js";

const directorioUploads = fileURLToPath(
  new URL("../../../uploads/", import.meta.url),
);
const limiteComprobante = 5 * 1024 * 1024;
const tiposComprobante = {
  "application/pdf": { extensiones: [".pdf"], firma: "255044462d" },
  "image/jpeg": { extensiones: [".jpg", ".jpeg"], firma: "ffd8ff" },
  "image/png": { extensiones: [".png"], firma: "89504e470d0a1a0a" },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: limiteComprobante,
    files: 1,
    fields: 12,
    parts: 13,
    fieldSize: 4096,
  },
  fileFilter(_req, file, callback) {
    if (!Object.hasOwn(tiposComprobante, file.mimetype)) {
      return callback(serviceError("El comprobante debe ser PDF, JPG o PNG"));
    }
    callback(null, true);
  },
}).single("comprobante");

// Se ejecuta después de autenticar y comprobar el rol del colaborador.
export function recibirComprobante(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return next(
      serviceError("Enviá los datos y el comprobante como multipart/form-data"),
    );
  }
  
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return next(
        serviceError(
          error.code === "LIMIT_FILE_SIZE"
            ? "El comprobante no puede superar 5 MB"
            : "Formulario inválido: enviá un solo archivo en el campo comprobante",
          error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        ),
      );
    }
    if (error)
      return next(
        error.status
          ? error
          : serviceError("No se pudo leer el formulario del comprobante"),
      );
    next();
  });
}

export function obtenerRutaComprobante(ruta) {
  // Solo permite archivos de esta carpeta; nunca rutas absolutas ni ../.
  if (
    typeof ruta !== "string" ||
    !/^incapacidades\/[\w-]+\.(pdf|jpe?g|png)$/i.test(ruta)
  ) {
    throw serviceError(
      "La solicitud no tiene una ruta de comprobante válida",
      404,
    );
  }
  return path.join(directorioUploads, ruta);
}

export async function guardarComprobante(file) {
  if (!file)
    throw serviceError("Debe adjuntar el comprobante de la incapacidad");
  const nombre = validateText(file.originalname, "Nombre del comprobante", 255);
  const tipo = tiposComprobante[file.mimetype];
  const firma = tipo && Buffer.from(tipo.firma, "hex");
  if (
    !tipo ||
    !tipo.extensiones.includes(path.extname(nombre).toLowerCase()) ||
    !file.buffer.subarray(0, firma.length).equals(firma)
  ) {
    throw serviceError(
      "El contenido y la extensión del comprobante deben corresponder a PDF, JPG o PNG",
    );
  }

  const comprobanteRuta = `incapacidades/${randomUUID()}${tipo.extensiones[0]}`;
  await mkdir(path.join(directorioUploads, "incapacidades"), {
    recursive: true,
  });
  await writeFile(obtenerRutaComprobante(comprobanteRuta), file.buffer, {
    flag: "wx",
  });
  return { comprobanteRuta, comprobanteNombre: nombre };
}

export async function eliminarComprobante(ruta) {
  try {
    await unlink(obtenerRutaComprobante(ruta));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
