import { validateId, validateDate, validateText, serviceError } from "./serviceUtils.js";
import { getRestaurantePermitido } from "../../modules/colaboradores/colaboradores.service.js";

export const estadosSolicitud = new Set(["PENDIENTE", "APROBADA", "RECHAZADA"]);

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

export async function validarAccesoSolicitud(solicitud, usuario) {
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
        "Solo podés consultar solicitudes de tu restaurante asignado.",
        403,
      );
    }
  }
}
