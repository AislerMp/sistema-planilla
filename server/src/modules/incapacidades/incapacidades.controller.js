import * as incapacidadesServices from "./incapacidades.services.js";
import {
  guardarComprobante,
  eliminarComprobante,
  obtenerRutaComprobante,
} from "./incapacidades.upload.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

export async function getTiposIncapacidadesController(req, res) {
  const incapacidades = await incapacidadesServices.listarTiposIncapacidad();
  return res.status(200).json(incapacidades);
}

export async function getIncapacidadController(req, res) {
  const incapacidadSolicitud = await incapacidadesServices.obtenerIncapacidad(
    req.params.id,
    req.user,
  );

  return res.status(200).json(incapacidadSolicitud);
}

export async function getMisIncapacidades(req, res) {
  const incapacidades = await incapacidadesServices.listarMisIncapacidades(
    req.user,
    {
      desde: req.query?.desde,
      hasta: req.query?.hasta,
      estado: req.query?.estado,
    },
  );

  return res.status(200).json(incapacidades);
}

export async function getIncapacidadesByRestauranteController(req, res) {
  const incapacidades =
    await incapacidadesServices.listarIncapacidadesPorRestaurante(
      req.user,
      req.params.restauranteId ?? req.query?.restauranteId,
      {
        desde: req.query?.desde,
        hasta: req.query?.hasta,
        estado: req.query?.estado,
      },
    );

  return res.status(200).json(incapacidades);
}

export async function getCalculoIncapacidadController(req, res) {
  const calculo = await incapacidadesServices.obtenerCalculoIncapacidad(
    req.params.id,
    req.user,
  );
  return res.status(200).json(calculo);
}

export async function crearIncapacidadController(req, res) {
  const comprobante = await guardarComprobante(req.file);

  let incapacidad;
  try {
    incapacidad = await incapacidadesServices.solicitarIncapacidad(
      { ...req.body, ...comprobante },
      req.user,
    );
  } catch (error) {
    // SQL revierte la solicitud; el archivo se elimina por separado.
    try {
      await eliminarComprobante(comprobante.comprobanteRuta);
    } catch (errorArchivo) {
      console.error(
        "No se pudo eliminar el comprobante de la solicitud fallida",
        errorArchivo,
      );
    }
    throw error;
  }

  return res.status(201).json(incapacidad);
}

export async function revisarIncapacidadGerenteController(req, res) {
  const incapacidad = await incapacidadesServices.revisarIncapacidadGerente(
    req.params.id,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(incapacidad);
}

export async function resolverIncapacidadRhController(req, res) {
  const resultado = await incapacidadesServices.resolverIncapacidadRh(
    req.params.id,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(resultado);
}

export async function descargarComprobanteController(req, res, next) {
  const incapacidad = await incapacidadesServices.obtenerIncapacidad(
    req.params.id,
    req.user,
  );
  
  const ruta = obtenerRutaComprobante(incapacidad.ComprobanteRuta);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  return res.download(ruta, incapacidad.ComprobanteNombre, (error) => {
    if (error) {
      next(
        error.code === "ENOENT"
          ? serviceError("No se encontró el comprobante de la incapacidad", 404)
          : error,
      );
    }
  });
}
