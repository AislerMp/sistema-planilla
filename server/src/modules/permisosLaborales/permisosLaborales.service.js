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
  validarRestauranteSolicitudes,
  validarEstadoResolucion,
  validarSolicitudPendiente,
  validarFechaSolicitudFutura,
  validarFechaResolucion,
} from "../../shared/utils/solicitudUtils.js";

import {
  getColaborador,
  getRestaurantePermitido,
} from "../colaboradores/colaboradores.service.js";

import { obtenerCalendarioActual } from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";
import { registrarBitacora, entidades } from "../bitacora/bitacora.service.js";

async function validarFechaPendiente(filtros) {
  const { fechaHoy } = obtenerCalendarioActual();
  await permisosRepository.rechazarSolicitudesVencidas(fechaHoy, filtros);
}

export async function obtenerPermisoPorId(permisoId, usuario) {
  const id = validateId(permisoId, "PermisoId");
  const permiso = await permisosRepository.getPermisosById(id);
  if (!permiso) {
    throw serviceError("No se encontró el permiso laboral solicitado", 404);
  }

  await validarAccesoSolicitud(permiso, usuario);
  await validarFechaPendiente({ permisoId: id });
  return permisosRepository.getPermisosById(id);
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
  const restauranteConsultaId = await validarRestauranteSolicitudes(
    restauranteSolicitado,
    usuario,
  );

  await validarFechaPendiente({ restauranteId: restauranteConsultaId });
  return await permisosRepository.getPermisosByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

export async function listarPermisosAdministracion(usuario, filtros = {}) {
  if (!["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(usuario?.Rol)) {
    throw serviceError("No tiene permisos para consultar estas solicitudes", 403);
  }

  const restauranteId =
    filtros.restauranteId == null || filtros.restauranteId === ""
      ? null
      : validateId(filtros.restauranteId, "RestauranteId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  await validarFechaPendiente({ restauranteId });
  return permisosRepository.getPermisosByRestaurante(restauranteId, filtrosValidados);
}

export async function listarPermisosDeMiRestaurante(usuario, filtros = {}) {
  const restauranteId = await getRestaurantePermitido(usuario);
  if (restauranteId === null) {
    throw serviceError("Debe indicar el restaurante que desea consultar");
  }

  const filtrosValidados = validarFiltrosSolicitudes(filtros);
  await validarFechaPendiente({ restauranteId });
  return permisosRepository.getPermisosByRestaurante(
    restauranteId,
    filtrosValidados,
  );
}

export async function solicitarPermiso({ fechaSolicitada, motivo }, usuario) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const fechaValidada = validarFechaSolicitudFutura(
    fechaSolicitada,
    "FechaSolicitada",
  );

  const motivoValidado = validateText(motivo, "Motivo", 500);

  const colaboradorActual = await getColaborador(colaboradorId);
  if (!colaboradorActual) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  
  const solicitudExistente =
    await permisosRepository.getPermisoByColaboradorYFecha(
      colaboradorId,
      fechaValidada,
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
    fechaSolicitada: fechaValidada,
    motivo: motivoValidado,
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
  const observacionValidada = validateText(
    observacion,
    "Observación",
    500,
    true,
  );
  const estadoValidado = validarEstadoResolucion(estado, "Estado");

  const solicitudActual = await permisosRepository.getPermisosById(id);
  if (!solicitudActual) {
    throw serviceError("No se encontró la solicitud de permiso laboral", 404);
  }

  await validarAccesoSolicitud(
    solicitudActual,
    usuario,
    "Solo podés resolver solicitudes de tu restaurante",
  );

  validarFechaResolucion(solicitudActual.FechaSolicitada);
  validarSolicitudPendiente(solicitudActual);

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

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES_PERMISOS_LABORALES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: solicitudActual,
        datosNuevos: permisoResuelto,
      },
      transaction,
    );

    await transaction.commit();
    return permisoResuelto;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la resolución del permiso laboral",
        rollbackError,
      );
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
  const idColaborador = validateId(colaboradorId, "ColaboradorId");
  const fechaValida = validateDate(fechaAsignada, "FechaAsignada");

  if (!transaction)
    throw serviceError(
      "Debe proporcionarse una transacción para validar el día sin permiso aprobado",
      500,
    );

  const permisoConsultado =
    await permisosRepository.getPermisoByColaboradorYFecha(
      idColaborador,
      fechaValida,
      transaction,
    );

  if (permisoConsultado && permisoConsultado.Estado === "APROBADA") {
    throw serviceError(
      "El colaborador ya tiene un permiso laboral aprobado para la fecha indicada",
      400,
    );
  }
}
