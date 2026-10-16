import * as permisosRepository from "./permisosLaborales.repository.js";
import {
  bloquearColaboradorSolicitudes,
  revertirSolicitud,
} from "../solicitudes/solicitudes.repository.js";

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
import { validarDiasVacaciones } from "../vacaciones/services/vacaciones.service.js";

import { getColaborador } from "../colaboradores/colaboradores.service.js";

import { obtenerCalendarioActual } from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../bitacora/bitacora.service.js";

async function validarFechaPendiente(filtros) {
  const { fechaHoy } = obtenerCalendarioActual();
  await permisosRepository.rechazarSolicitudesVencidas(fechaHoy, filtros);
}

export async function obtenerPermisoPorId(solicitudId, usuario) {
  const id = validateId(solicitudId, "SolicitudId");
  const permiso = await permisosRepository.getPermisosById(id);
  if (!permiso) {
    throw serviceError("No se encontró el permiso laboral solicitado", 404);
  }

  await validarAccesoSolicitud(permiso, usuario);
  await validarFechaPendiente({ solicitudId: id });
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
  if (!["GERENTE", "ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(usuario?.Rol)) {
    throw serviceError("No tiene permisos para consultar estas solicitudes", 403);
  }

  const restauranteSolicitado = validateId(restauranteId, "RestauranteId", true);
  const filtrosValidados = validarFiltrosSolicitudes(filtros);
  
  // Solo RH y administración pueden consultar todos los restaurantes.
  const restauranteConsultaId = usuario.Rol !== "GERENTE" && restauranteSolicitado === null
    ? null
    : await validarRestauranteSolicitudes(restauranteSolicitado, usuario);

  await validarFechaPendiente({ restauranteId: restauranteConsultaId });
  return await permisosRepository.getPermisosByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

export async function solicitarPermiso({ fechaSolicitada, motivo }, usuario) {

  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const fechaValidada = validarFechaSolicitudFutura(
    fechaSolicitada,
    "FechaSolicitada",
  );

  const motivoValidado = validateText(motivo, "Motivo", 500);

  const colaboradorActual = await getColaborador(colaboradorId, usuario);
  if (!colaboradorActual) {
    throw serviceError("Colaborador no encontrado", 404);
  }

  const transaction = await beginTransaction();
  try {
    await bloquearColaboradorSolicitudes(colaboradorId, transaction);

    const solicitudExistente =
      await permisosRepository.getPermisoByColaboradorYFecha(
        colaboradorId,
        fechaValidada,
        transaction,
      );
      
    if (solicitudExistente) {
      throw serviceError(
        "Ya existe una solicitud de permiso laboral para la fecha indicada",
        400,
      );
    }

    await validarDiasVacaciones(colaboradorId, fechaValidada, fechaValidada, transaction);

    const solicitudCreada = await permisosRepository.createPermiso(
      {
        colaboradorId,
        restauranteId: colaboradorActual.RestauranteId,
        registradoPorUsuarioId: usuarioId,
        fechaSolicitada: fechaValidada,
        motivo: motivoValidado,
      },
      transaction,
    );
    if (!solicitudCreada) {
      throw serviceError(
        "No se pudo crear la solicitud de permiso laboral",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES,
        registroId: solicitudCreada.SolicitudId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: solicitudCreada,
      },
      transaction,
    );
    await transaction.commit();
    return solicitudCreada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la creación del permiso laboral",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function resolverPermiso(
  solicitudId,
  { estado, observacion } = {},
  usuario,
) {
  if (!usuario) throw serviceError("Debe iniciar sesión", 401);
  if (usuario?.Rol !== "GERENTE") {
    throw serviceError(
      "No tiene permisos para resolver solicitudes de permisos laborales",
      403,
    );
  }

  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const id = validateId(solicitudId, "SolicitudId");
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
      ? acciones.APROBAR_PERMISO_LABORAL
      : acciones.RECHAZAR_PERMISO_LABORAL;

  const transaction = await beginTransaction();

  try {
    if (estadoValidado === "APROBADA") {
      await bloquearColaboradorSolicitudes(solicitudActual.ColaboradorId, transaction);
      await validarDiasVacaciones(
        solicitudActual.ColaboradorId, solicitudActual.FechaSolicitada, solicitudActual.FechaSolicitada, transaction,
      );
    }
    const permisoResuelto = await permisosRepository.resolverPermiso(
      id,
      {
        estado: estadoValidado,
        revisadoPorGerenteId: usuarioId,
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
        entidad: entidades.SOLICITUDES,
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

export async function revertirPermiso(
  solicitudId,
  { motivo } = {},
  usuario,
) {
  if (usuario.Rol !== "GERENTE") {
    throw serviceError(
      "Solo el gerente puede revertir permisos laborales.",
      403,
    );
  }

  const id = validateId(solicitudId, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const motivoValidado = validateText(motivo, "Motivo de reversión", 500);

  const transaction = await beginTransaction();

  try {
    const solicitudActual = await permisosRepository.getPermisosById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError(
        "No se encontró la solicitud de permiso laboral.",
        404,
      );
    }

    await validarAccesoSolicitud(
      solicitudActual,
      usuario,
      "Solo podés revertir permisos de tu restaurante.",
    );

    if (!["APROBADA", "RECHAZADA"].includes(solicitudActual.Estado)) {
      throw serviceError(
        "Solo se pueden revertir permisos aprobados o rechazados.",
        409,
      );
    }

    // No devolver a pendiente un permiso cuya fecha ya llegó.
    validarFechaResolucion(solicitudActual.FechaSolicitada);

    // Comparte el bloqueo utilizado al crear solicitudes.
    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    // Una solicitud rechazada podría tener otra solicitud para ese día.
    const solicitudesDelDia =
      await permisosRepository.getPermisosByColaborador(
        solicitudActual.ColaboradorId,
        {
          desde: solicitudActual.FechaSolicitada,
          hasta: solicitudActual.FechaSolicitada,
        },
        transaction,
      );

    const existeOtroPermiso = solicitudesDelDia.some(
      (solicitud) =>
        solicitud.SolicitudId !== id &&
        ["PENDIENTE", "APROBADA"].includes(solicitud.Estado),
    );

    if (existeOtroPermiso) {
      throw serviceError(
        "Existe otro permiso pendiente o aprobado para esa fecha.",
        409,
      );
    }

    await validarDiasVacaciones(
      solicitudActual.ColaboradorId, solicitudActual.FechaSolicitada, solicitudActual.FechaSolicitada, transaction,
    );
    const permisoRevertido = await revertirSolicitud(
      id,
      solicitudActual.TipoSolicitud,
      solicitudActual.Estado,
      "PENDIENTE",
      transaction,
    );

    if (!permisoRevertido) {
      throw serviceError(
        "No se pudo revertir el permiso porque su estado cambió durante la operación.",
        409,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES,
        registroId: id,
        accion: acciones.REVERTIR,
        datosAnteriores: solicitudActual,
        datosNuevos: {
          ...permisoRevertido,
          motivoReversion: motivoValidado,
        },
      },
      transaction,
    );

    await transaction.commit();
    return permisoRevertido;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo deshacer la reversión del permiso laboral:",
        rollbackError,
      );
    }

    throw error;
  }
}
