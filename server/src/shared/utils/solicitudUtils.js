import { validateId, validateDate, validateText, serviceError } from "./serviceUtils.js";
import { getRestaurantePermitido } from "../../modules/colaboradores/colaboradores.service.js";
import { obtenerCalendarioActual, fechaSQLComoTexto } from "./fechaUtils.js";

export const estadosSolicitud = new Set(["PENDIENTE", "EN_REVISION_RH", "APROBADA", "RECHAZADA"]);

export function validarFiltrosSolicitudes(filtros = {}) {
  let desde = validateDate(filtros?.desde, "Fecha desde", true);
  const hasta = validateDate(filtros?.hasta, "Fecha hasta", true);
  const estado =
    filtros?.estado == null || filtros.estado === ""
      ? null
      : validateText(filtros.estado, "Estado", 15).toUpperCase();

  if (estado && !estadosSolicitud.has(estado)) {
    throw serviceError("El estado de la solicitud no es válido");
  }

  if (desde && hasta && desde > hasta) {
    throw serviceError("La fecha desde no puede ser mayor que la fecha hasta");
  }

  if (!desde && hasta) desde = hasta;

  return { desde, hasta, estado };
}

export async function validarAccesoSolicitud(
  solicitud,
  usuario,
  mensajeRestaurante = "Solo podés consultar solicitudes de tu restaurante asignado.",
) {
  if (usuario.Rol === "COLABORADOR") {
    const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
    if (solicitud.ColaboradorId !== colaboradorId) {
      throw serviceError("Solo podés consultar tus propias solicitudes.", 403);
    }
  }

  if (usuario.Rol === "GERENTE") {
    const restaurantePermitido = await getRestaurantePermitido(usuario);
    if (solicitud.RestauranteId !== restaurantePermitido) {
      throw serviceError(
        mensajeRestaurante,
        403,
      );
    }
  }
}

// Recibe el ID ya validado por el servicio, que decide si es obligatorio.
export async function validarRestauranteSolicitudes(restauranteSolicitado, usuario) {
  const restaurantePermitido = await getRestaurantePermitido(usuario);
  if (
    restaurantePermitido !== null &&
    restauranteSolicitado !== null &&
    restauranteSolicitado !== restaurantePermitido
  ) {
    throw serviceError("Solo podés consultar solicitudes de tu restaurante asignado.", 403);
  }

  const restauranteId = restaurantePermitido ?? restauranteSolicitado;
  if (restauranteId === null) {
    throw serviceError("Debe indicar el restaurante que desea consultar");
  }
  return restauranteId;
}

export function validarEstadoResolucion(estado, campo = "Estado") {
  const estadoValidado = validateText(estado, campo, 15).toUpperCase();
  if (estadoValidado !== "APROBADA" && estadoValidado !== "RECHAZADA") {
    throw serviceError("El estado debe ser APROBADA o RECHAZADA");
  }
  return estadoValidado;
}

export function validarSolicitudPendiente(solicitud) {
  if (solicitud.Estado !== "PENDIENTE") {
    throw serviceError("Esta solicitud ya fue resuelta", 409);
  }
}

export function validarFechaSolicitudFutura(fechaSolicitada, campo = "Fecha solicitada") {
  const fecha = validateDate(fechaSolicitada, campo);
  // Las solicitudes usan el día calendario de Costa Rica, sin el corte de marcas.
  const { fechaHoy } = obtenerCalendarioActual();
  if (fechaSQLComoTexto(fecha) <= fechaHoy) {
    throw serviceError("La fecha solicitada debe ser posterior al día de hoy.", 400);
  }
  return fecha;
}

// Recibe el SQL DATE de la solicitud y devuelve su fecha calendario como texto.
export function validarFechaResolucion(fechaSolicitada) {
  const fecha = fechaSQLComoTexto(fechaSolicitada);
  const { fechaHoy } = obtenerCalendarioActual();
  if (fechaHoy >= fecha) {
    throw serviceError("La solicitud solo puede resolverse antes de la fecha solicitada");
  }
  return fecha;
}
