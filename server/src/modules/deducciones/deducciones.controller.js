import * as deduccionesService from "./services/deducciones.service.js";
import * as solicitudesService from "./services/solicitudesDeducciones.service.js";

function filtrosSolicitudes(query) {
  return { desde: query.desde, hasta: query.hasta, estado: query.estado };
}

export async function getDeducciones(req, res) {
  const deducciones = await deduccionesService.getDeduccionesService({
    tipoDeduccion: req.query.tipoDeduccion,
    codigo: req.query.codigo,
    fechaVigencia: req.query.fechaVigencia,
  });

  return res.status(200).json(deducciones);
}

export async function getDeduccionesById(req, res) {
  const deduccion = await deduccionesService.obtenerDeduccionById(
    req.params.deduccionId,
    req.user,
  );

  return res.status(200).json(deduccion);
}

export async function crearDeduccion(req, res) {
  const deduccion = await deduccionesService.crearDeduccion(req.body ?? {}, req.user);
  return res.status(201).json(deduccion);
}

export async function actualizarDeduccion(req, res) {
  const deduccion = await deduccionesService.actualizarDatosDeduccion(
    req.params.deduccionId,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(deduccion);
}

export async function crearVersionDeduccion(req, res) {
  const deduccion = await deduccionesService.crearVersionDeduccion(
    req.params.deduccionId,
    req.body ?? {},
    req.user,
  );
  return res.status(201).json(deduccion);
}

export async function finalizarVigenciaDeduccion(req, res) {
  const deduccion = await deduccionesService.finalizarVigenciaDeduccion(
    req.params.deduccionId,
    req.body?.fechaFin,
    req.user,
  );
  return res.status(200).json(deduccion);
}

export async function getMisSolicitudes(req, res) {
  const solicitudes = await solicitudesService.listarMisSolicitudes(
    req.user,
    filtrosSolicitudes(req.query),
  );
  return res.status(200).json(solicitudes);
}

export async function getSolicitudesPorRestaurante(req, res) {
  const solicitudes = await solicitudesService.listarSolicitudesPorRestaurante(
    req.user,
    req.params.restauranteId ?? req.query.restauranteId,
    filtrosSolicitudes(req.query),
  );
  return res.status(200).json(solicitudes);
}

export async function getSolicitudById(req, res) {
  const solicitud = await solicitudesService.obtenerSolicitud(
    req.params.solicitudId,
    req.user,
  );
  return res.status(200).json(solicitud);
}

export async function solicitarDeduccion(req, res) {
  const solicitud = await solicitudesService.solicitarDeduccion(
    req.body ?? {},
    req.user,
  );
  return res.status(201).json(solicitud);
}

export async function resolverSolicitudRh(req, res) {
  const solicitud = await solicitudesService.resolverSolicitud(
    req.params.solicitudId,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(solicitud);
}

