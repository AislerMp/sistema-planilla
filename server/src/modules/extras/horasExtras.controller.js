import {
  getSolicitudById,
  getSolicitudesByColaborador,
  getSolicitudesByRestaurante,
  crearSolicitudHorasExtras,
  resolverSolicitudHorasExtras,
} from "./horasExtras.service.js";

export async function obtenerSolicitudController(req, res) {
  const solicitud = await getSolicitudById(req.params.id, req.user);

  return res.status(200).json(solicitud);
}

export async function listarMisSolicitudesController(req, res) {
  const solicitudes = await getSolicitudesByColaborador(
    req.user.ColaboradorId,
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
    req.user,
  );

  return res.status(200).json(solicitudes);
}

export async function listarSolicitudesRestauranteController(req, res) {
  const solicitudes = await getSolicitudesByRestaurante(
    req.user,
    req.query.restauranteId,
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
  );

  return res.status(200).json(solicitudes);
}

export async function crearSolicitudController(req, res) {
  const solicitud = await crearSolicitudHorasExtras(req.user, req.body ?? {});

  return res.status(201).json({
    message: "Solicitud de horas extras creada correctamente.",
    solicitud,
  });
}

export async function resolverSolicitudController(req, res) {
  const solicitud = await resolverSolicitudHorasExtras(
    req.params.id,
    req.body ?? {},
    req.user,
  );

  return res.status(200).json({
    message: "Solicitud de horas extras resuelta correctamente.",
    solicitud,
  });
}
