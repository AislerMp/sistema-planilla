import {
  validateId,
  validateDate,
  validateText,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

import * as horasExtraRepository from "./horasExtras.repository.js";
import * as asistenciasRepository from "../asistenciasDiarias/asistenciasDiarias.repository.js";
import {
  getRestaurantePermitido,
  getColaborador,
} from "../colaboradores/colaboradores.service.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";
import { registrarBitacora, entidades } from "../bitacora/bitacora.service.js";

/* SERVICIOS DE HORAS EXTRAS */

function validarMinutosDetectados(minutosDetectados) {
  if (
    !Number.isInteger(minutosDetectados) ||
    minutosDetectados < 0 ||
    minutosDetectados > 2147483647
  ) {
    throw serviceError(
      "Los minutos detectados deben ser un entero entre 0 y 2147483647",
      400,
    );
  }
  return minutosDetectados;
}

function validarMinutosSolicitados(minutosSolicitados) {
  if (
    !Number.isInteger(minutosSolicitados) ||
    minutosSolicitados < 1 ||
    minutosSolicitados > 2147483647
  ) {
    throw serviceError(
      "Los minutos solicitados deben ser un entero entre 1 y 2147483647",
    );
  }
  return minutosSolicitados;
}

export async function obtenerhorasExtrabyAsistencia(id) {
  const asistenciaId = validateId(id);
  const horasExtra =
    await horasExtraRepository.getHorasExtrasByAsistencia(asistenciaId);

  if (!horasExtra) throw serviceError("Horas extras no encontradas", 404);

  return horasExtra;
}

export async function insertarHorasExtra(
  { id, minutosDetectados } = {},
  transaction = null,
) {
  const asistenciaId = validateId(id);
  const minutos = validarMinutosDetectados(minutosDetectados);

  const asistenciaActual =
    await asistenciasRepository.getAsistenciaById(asistenciaId);

  if (!asistenciaActual) throw serviceError("La asistencia no existe", 404);

  const horasExtrasExistentes =
    await horasExtraRepository.getHorasExtrasByAsistencia(asistenciaId);

  if (horasExtrasExistentes) {
    throw serviceError(
      "La asistencia ya tiene un registro de horas extras",
      409,
    );
  }

  try {
    const horasExtrasCreadas = await horasExtraRepository.createHorasExtras(
      {
        asistenciaId,
        minutosDetectados: minutos,
      },
      transaction,
    );

    if (!horasExtrasCreadas) {
      throw serviceError("No se pudieron registrar las horas extras", 500);
    }

    return horasExtrasCreadas;
  } catch (error) {
    // La restriccion unica tambien protege ante inserciones simultaneas.
    if (error.number === 2601 || error.number === 2627) {
      throw serviceError(
        "La asistencia ya tiene un registro de horas extras",
        409,
      );
    }
    throw error;
  }
}

export async function actualizarHorasExtra(
  id,
  minutosDetectados,
  usuarioActorId,
) {
  const asistenciaId = validateId(id);
  const minutos = validarMinutosDetectados(minutosDetectados);
  const actorId = validateId(usuarioActorId, "usuarioActorId");

  const transaction = await beginTransaction();
  try {
    const horasExtrasAnteriores =
      await horasExtraRepository.getHorasExtrasByAsistencia(
        asistenciaId,
        transaction,
      );

    if (!horasExtrasAnteriores) {
      throw serviceError("Horas extras no encontradas", 404);
    }

    const horasExtrasActualizadas =
      await horasExtraRepository.updateMinutosExtras(
        asistenciaId,
        minutos,
        transaction,
      );

    if (!horasExtrasActualizadas) {
      throw serviceError("Horas extras no encontradas", 404);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.HORAS_EXTRAS,
        registroId: horasExtrasAnteriores.HoraExtraId,
        accion: "AJUSTAR_HORAS",
        datosAnteriores: {
          minutosDetectados: horasExtrasAnteriores.MinutosDetectados,
        },
        datosNuevos: {
          minutosDetectados: horasExtrasActualizadas.MinutosDetectados,
        },
      },
      transaction,
    );

    await transaction.commit();
    return horasExtrasActualizadas;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}

// Función interna: recibe la asistencia recién actualizada.
export async function sincronizarHorasExtras(
  asistencia,
  usuarioActorId,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para guardar las horas extras",
      500,
    );
  }

  if (!asistencia) {
    throw serviceError("La asistencia no existe", 404);
  }

  const asistenciaId = validateId(asistencia.AsistenciaId, "AsistenciaId");

  const actorId = validateId(usuarioActorId, "UsuarioId");

  const minutosEfectivos = validarMinutosDetectados(
    asistencia.MinutosAjustados ?? asistencia.MinutosCalculados,
  );

  const minutosExtras = Math.max(0, minutosEfectivos - 480);

  const registroAnterior =
    await horasExtraRepository.getHorasExtrasByAsistencia(
      asistenciaId,
      transaction,
    );

  // No necesitamos crear un registro sin horas extras.
  if (!registroAnterior && minutosExtras === 0) {
    return null;
  }

  // No hubo cambios en los minutos extras.
  if (
    registroAnterior &&
    registroAnterior.MinutosDetectados === minutosExtras
  ) {
    return registroAnterior;
  }

  let registroGuardado;

  if (registroAnterior) {
    registroGuardado = await horasExtraRepository.updateMinutosExtras(
      asistenciaId,
      minutosExtras,
      transaction,
    );
  } else {
    registroGuardado = await horasExtraRepository.createHorasExtras(
      {
        asistenciaId,
        minutosDetectados: minutosExtras,
      },
      transaction,
    );
  }

  if (!registroGuardado) {
    throw serviceError("No se pudieron guardar las horas extras", 500);
  }

  await registrarBitacora(
    {
      usuarioId: actorId,
      entidad: entidades.HORAS_EXTRAS,
      registroId: registroGuardado.HoraExtraId,
      accion: registroAnterior ? "ACTUALIZAR" : "CREAR",

      datosAnteriores: registroAnterior
        ? {
            asistenciaId,
            minutosDetectados: registroAnterior.MinutosDetectados,
          }
        : null,

      datosNuevos: {
        asistenciaId,
        minutosDetectados: registroGuardado.MinutosDetectados,
      },
    },
    transaction,
  );

  return registroGuardado;
}

/* SERVICES DE SOLICITUDES DE HORAS EXTRAS */

const estadosSolicitud = new Set(["PENDIENTE", "APROBADA", "RECHAZADA"]);

function validarFiltrosSolicitudes(filtros = {}) {
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

async function validarAccesoSolicitud(solicitud, usuario) {
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

export async function getSolicitudById(id, usuario) {
  const solicitudId = validateId(id, "solicitudId");
  const solicitud = await horasExtraRepository.getSolicitudById(solicitudId);

  if (!solicitud)
    throw serviceError("Solicitud de horas extras no encontrada", 404);

  await validarAccesoSolicitud(solicitud, usuario);
  return solicitud;
}

export async function getSolicitudesByColaborador(
  colaboradorId,
  filtros = {},
  usuario,
) {
  const id = validateId(colaboradorId, "colaboradorId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  if (usuario.Rol === "COLABORADOR") {
    const colaboradorActualId = validateId(
      usuario.ColaboradorId,
      "ColaboradorId",
    );

    if (id !== colaboradorActualId) {
      throw serviceError("Solo podés consultar tus propias solicitudes.", 403);
    }
  } else if (usuario.Rol === "GERENTE") {
    const restaurantePermitido = await getRestaurantePermitido(usuario);

    const solicitudes = await horasExtraRepository.getSolicitudesByColaborador(
      id,
      filtrosValidados,
    );

    return solicitudes.filter(
      (solicitud) => solicitud.RestauranteId === restaurantePermitido,
    );
  }

  return horasExtraRepository.getSolicitudesByColaborador(id, filtrosValidados);
}

export async function getSolicitudesByRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  const restauranteSolicitado = validateId(
    restauranteId,
    "restauranteId",
    true,
  );
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

  return horasExtraRepository.getSolicitudesByRestaurante(
    restauranteConsultaId,
    validarFiltrosSolicitudes(filtros),
  );
}

export async function crearSolicitudHorasExtras(
  usuario,
  { fechaSolicitada, minutosSolicitados, motivo },
) {
  if (usuario.Rol !== "COLABORADOR") {
    throw serviceError(
      "Solo el colaborador puede crear una solicitud de horas extras",
      403,
    );
  }

  const usuarioId = validateId(usuario.UsuarioId, "usuarioId");
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const validFecha = validateDate(fechaSolicitada, "Fecha solicitada");
  const validMinutosSolicitados = validarMinutosSolicitados(minutosSolicitados);
  const validMotivo = validateText(motivo, "El motivo", 500);

  const colaboradorActual = await getColaborador(colaboradorId, usuario);
  if (!colaboradorActual.Activo) {
    throw serviceError("El colaborador actual no existe o no esta activo", 403);
  }

  const transaction = await beginTransaction();

  try {
    const solicitudCreada = await horasExtraRepository.createSolicitud(
      {
        colaboradorId: colaboradorActual.ColaboradorId,
        restauranteId: colaboradorActual.RestauranteId,
        fechaSolicitada: validFecha,
        minutosSolicitados: validMinutosSolicitados,
        motivo: validMotivo,
      },
      transaction,
    );

    if (!solicitudCreada) {
      throw serviceError(
        "No se pudo registrar la solicitud de horas extras",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES_HORAS_EXTRAS,
        registroId: solicitudCreada.SolicitudHoraExtraId,
        accion: "CREAR",
        datosAnteriores: null,
        datosNuevos: {
          colaboradorId: solicitudCreada.ColaboradorId,
          restauranteId: solicitudCreada.RestauranteId,
          fechaSolicitada: fechaSQLComoTexto(solicitudCreada.FechaSolicitada),
          minutosSolicitados: solicitudCreada.MinutosSolicitados,
          motivo: solicitudCreada.Motivo,
          estado: solicitudCreada.Estado,
        },
      },
      transaction,
    );

    await transaction.commit();
    return solicitudCreada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}

export async function resolverSolicitudHorasExtras(
  idSolicitud,
  { estado, minutosAutorizados, observacion },
  usuario,
) {
  if (!["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario.Rol)) {
    throw serviceError(
      "No tiene permisos para resolver solicitudes de horas extras",
      403,
    );
  }

  const solicitudId = validateId(idSolicitud, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "usuarioId");
  const validEstado = validateText(estado, "El estado", 15).toUpperCase();

  if (validEstado !== "APROBADA" && validEstado !== "RECHAZADA") {
    throw serviceError("El estado debe ser APROBADA o RECHAZADA");
  }

  let validMinutosAutorizados = 0;
  const validObservacion = validateText(
    observacion,
    "La observación",
    500,
    true,
  );

  const solicitudActual =
    await horasExtraRepository.getSolicitudById(solicitudId);

  if (!solicitudActual) {
    throw serviceError("Solicitud de horas extras no encontrada", 404);
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

  if (validEstado === "APROBADA") {
    validMinutosAutorizados = validarMinutosSolicitados(minutosAutorizados);
    if (
      validMinutosAutorizados < 1 ||
      validMinutosAutorizados > solicitudActual.MinutosSolicitados
    ) {
      throw serviceError(
        "Los minutos autorizados deben ser mayores que cero y no superar los minutos solicitados",
      );
    }
  }

  const accionBitacora =
    validEstado === "APROBADA" ? "APROBAR_HORAS_EXTRA" : "RECHAZAR_HORAS_EXTRA";

  const transaction = await beginTransaction();

  try {
    const solicitudResuelta = await horasExtraRepository.resolverSolicitud(
      solicitudId,
      {
        estado: validEstado,
        minutosAutorizados: validMinutosAutorizados,
        revisadoPorUsuarioId: usuarioId,
        observacion: validObservacion,
      },
      transaction,
    );

    if (!solicitudResuelta) {
      throw serviceError("La solicitud ya fue resuelta por otro usuario", 409);
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES_HORAS_EXTRAS,
        registroId: solicitudResuelta.SolicitudHoraExtraId,
        accion: accionBitacora,
        datosAnteriores: {
          colaboradorId: solicitudActual.ColaboradorId,
          restauranteId: solicitudActual.RestauranteId,
          fechaSolicitada,
          minutosSolicitados: solicitudActual.MinutosSolicitados,
          motivo: solicitudActual.Motivo,
          estado: solicitudActual.Estado,
          minutosAutorizados: solicitudActual.MinutosAutorizados,
          revisadoPorUsuarioId: solicitudActual.RevisadoPorUsuarioId,
          observacion: solicitudActual.Observacion,
        },
        datosNuevos: {
          colaboradorId: solicitudResuelta.ColaboradorId,
          restauranteId: solicitudResuelta.RestauranteId,
          fechaSolicitada: fechaSQLComoTexto(solicitudResuelta.FechaSolicitada),
          minutosSolicitados: solicitudResuelta.MinutosSolicitados,
          motivo: solicitudResuelta.Motivo,
          estado: solicitudResuelta.Estado,
          minutosAutorizados: solicitudResuelta.MinutosAutorizados,
          revisadoPorUsuarioId: solicitudResuelta.RevisadoPorUsuarioId,
          observacion: solicitudResuelta.Observacion,
        },
      },
      transaction,
    );

    await transaction.commit();
    return solicitudResuelta;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}
