import { randomUUID } from "node:crypto";
import { validateId, serviceError } from "../../shared/utils/serviceUtils.js";
import { getRestaurantePermitido } from "../colaboradores/colaboradores.service.js";
import { getSolicitudesBaseById } from "../solicitudes/solicitudes.repository.js";

const DURACION_NOTIFICACION_MS = 10 * 60 * 1000;

let solicitudesNuevas = [];

function limpiarNotificacionesVencidas() {
  const limite = Date.now() - DURACION_NOTIFICACION_MS;

  solicitudesNuevas = solicitudesNuevas.filter(
    (aviso) => aviso.NotificacionFechaCreacion.getTime() > limite,
  );
}

export async function notificarSolicitudGuardada(solicitud) {
  try {
    await registrarNotificaciones(
      solicitud.SolicitudId,
      solicitud.Estado,
    );
  } catch (error) {
    console.error("No se pudo agregar el aviso de la solicitud:", error);
  }
}

export async function registrarNotificaciones(
  solicitudId,
  estadoConfirmado = null,
) {
  const solicitudIdValid = validateId(solicitudId, "SolicitudId");
  const solicitud = await getSolicitudesBaseById(solicitudIdValid);

  if (!solicitud) {
    return null;
  }

  limpiarNotificacionesVencidas();

  const aviso = {
    NotificacionId: randomUUID(),
    NotificacionFechaCreacion: new Date(),
    SolicitudId: solicitud.SolicitudId,
    ColaboradorId: solicitud.ColaboradorId,
    RestauranteId: solicitud.RestauranteId,
    TipoSolicitud: solicitud.TipoSolicitud,
    Estado: estadoConfirmado ?? solicitud.Estado,
  };

  solicitudesNuevas.push(aviso);
  return aviso;
}

export async function listarNotificaciones(usuario) {
  limpiarNotificacionesVencidas();

  if (usuario.Rol === "COLABORADOR") {
    return solicitudesNuevas.filter(
      (aviso) => aviso.ColaboradorId === usuario.ColaboradorId,
    );
  }

  if (usuario.Rol === "GERENTE") {
    const restaurantePermitido = await getRestaurantePermitido(usuario);

    return solicitudesNuevas.filter(
      (aviso) => aviso.RestauranteId === restaurantePermitido,
    );
  }

  if (usuario.Rol === "RECURSOS_HUMANOS") {
    return [...solicitudesNuevas];
  }
}