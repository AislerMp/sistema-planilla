import * as permisosRepository from "./permisosLaborales.repository.js";

import {
  validateId,
  validateDate,
  validateText,
  serviceError,
} from "../../shared/utils/serviceUtils.js";
import {
  validarAccesoSolicitud,
  validarFiltrosSolicitudes,
} from "../../shared/utils/solicitudUtils.js";

import {
  getRestaurantePermitido,
  getColaborador,
} from "../colaboradores/colaboradores.service.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";
import { registrarBitacora, entidades } from "../bitacora/bitacora.service.js";

async function validarFechaPendiente(filtros) {
  const { fechaHoy } = obtenerCalendarioActual();
  await permisosRepository.rechazarSolicitudesVencidas(fechaHoy, filtros);
}

export async function obtenerPermisoPorId(permisoId, usuario) {
  validateId(permisoId, "PermisoId");
  const permiso = await permisosRepository.getPermisosById(permisoId);
  if (!permiso) {
    throw serviceError("No se encontró el permiso laboral solicitado", 404);
  }

  await validarAccesoSolicitud(permiso, usuario);
  await validarFechaPendiente({ permisoId });
  return permisosRepository.getPermisosById(permisoId);
}

export async function listarMisPermisos(usuario, filtros = {}) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  await validarFechaPendiente({ colaboradorId });
  return await permisosRepository.getPermisosByColaborador(
    colaboradorId,
    filtrosValidados,
  );
}

export async function listarPermisosPorRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  const restauranteSolicitado = validateId(restauranteId, "RestauranteId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);
  const restaurantePermitido = await getRestaurantePermitido(usuario);

  if (
    restaurantePermitido !== null &&
    restauranteSolicitado !== null &&
    restauranteSolicitado !== restaurantePermitido
  ) {
    throw serviceError(
      "Solo podés consultar solicitudes de tu restaurante asignado.",
      403,
    );
  }

  const restauranteConsultaId = restaurantePermitido ?? restauranteSolicitado;
  if (restauranteConsultaId === null) {
    throw serviceError("Debe indicar el restaurante que desea consultar");
  }

  await validarFechaPendiente({ restauranteId: restauranteConsultaId });
  return await permisosRepository.getPermisosByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

export async function solicitarPermiso({ fechaSolicitada, motivo }, usuario) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const fechaAsignada = validateDate(fechaSolicitada, "FechaSolicitada");
  const { fechaHoy } = obtenerCalendarioActual();

  if (fechaSQLComoTexto(fechaAsignada) <= fechaHoy) {
    throw serviceError(
      "La fecha solicitada debe ser posterior al día de hoy.",
      400,
    );
  }

  validateText(motivo, "Motivo", 500);

  const colaboradorActual = await getColaborador(colaboradorId);
  if (!colaboradorActual) {
    throw serviceError("Colaborador no encontrado", 404);
  }

  const solicitudExistente =
    await permisosRepository.getPermisoByColaboradorYFecha(
      colaboradorId,
      fechaAsignada,
    );

  if (solicitudExistente) {
    throw serviceError(
      "Ya existe una solicitud de permiso laboral para la fecha indicada",
      400,
    );
  }

  const solicitudCreada = await permisosRepository.createPermiso({
    colaboradorId,
    restauranteId: colaboradorActual.RestauranteId,
    fechaSolicitada: fechaAsignada,
    motivo,
  });

  if (!solicitudCreada) {
    throw serviceError("No se pudo crear la solicitud de permiso laboral", 500);
  }

  return solicitudCreada;
}

export async function resolverPermiso(
  permisoId,
  { estado, observacion } = {},
  usuario,
) {
  if (!usuario) throw serviceError("Debe iniciar sesión", 401);
  if (!["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario.Rol)) {
    throw serviceError(
      "No tiene permisos para resolver solicitudes de permisos laborales",
      403,
    );
  }

  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const id = validateId(permisoId, "PermisoId");
  const observacionValidada = validateText(observacion, "Observación", 500, true);
  const estadoValidado = validateText(estado, "Estado", 15).toUpperCase();

  if (estadoValidado !== "APROBADA" && estadoValidado !== "RECHAZADA") {
    throw serviceError("El estado debe ser APROBADA o RECHAZADA");
  }

  const solicitudActual = await permisosRepository.getPermisosById(id);
  if (!solicitudActual) {
    throw serviceError("No se encontró la solicitud de permiso laboral", 404);
  }

  if (usuario.Rol === "GERENTE") {
    const restaurantePermitido = await getRestaurantePermitido(usuario);

    if (solicitudActual.RestauranteId !== restaurantePermitido) {
      throw serviceError(
        "Solo podés resolver solicitudes de tu restaurante",
        403,
      );
    }
  }

  const { fechaHoy } = obtenerCalendarioActual();
  const fechaSolicitada = fechaSQLComoTexto(solicitudActual.FechaSolicitada);

  if (fechaHoy >= fechaSolicitada) {
    throw serviceError(
      "La solicitud solo puede resolverse antes de la fecha solicitada",
    );
  }

  if (solicitudActual.Estado !== "PENDIENTE") {
    throw serviceError("Esta solicitud ya fue resuelta", 409);
  }

  const accionBitacora =
    estadoValidado === "APROBADA"
      ? "APROBAR_PERMISO_LABORAL"
      : "RECHAZAR_PERMISO_LABORAL";

  const transaction = await beginTransaction();

  try {
    const permisoResuelto = await permisosRepository.resolverPermiso(
      id,
      {
        estado: estadoValidado,
        revisadoPorUsuarioId: usuarioId,
        observacion: observacionValidada,
      },
      transaction,
    );

    if (!permisoResuelto) {
      throw serviceError("La solicitud ya fue resuelta por otro usuario", 409);
    }

    await registrarBitacora({
      usuarioId,
      entidad: entidades.SOLICITUDES_PERMISOS_LABORALES,
      registroId: id,
      accion: accionBitacora,
      datosAnteriores: solicitudActual,
      datosNuevos: permisoResuelto,
    }, transaction);

    await transaction.commit();
    return permisoResuelto;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo revertir la resolución del permiso laboral", rollbackError);
    }
    throw error;
  }
}

// La utilizan otros servicios.
export async function validarDiaSinPermisoAprobado(
  colaboradorId,
  fechaAsignada,
  transaction,
) {
  // Implementación de la función
}
