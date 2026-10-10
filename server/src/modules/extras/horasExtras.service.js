import {
  validateId,
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

import { validarDiaSinPermisoAprobado } from "../permisosLaborales/permisosLaborales.service.js";
import { validarDiaSinIncapacidad } from "../incapacidades/incapacidades.services.js";
import * as horasExtraRepository from "./horasExtras.repository.js";
import * as asistenciasRepository from "../asistenciasDiarias/asistenciasDiarias.repository.js";
import {
  getRestaurantePermitido,
  getColaborador,
} from "../colaboradores/colaboradores.service.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { bloquearColaboradorSolicitudes } from "../solicitudes/solicitudes.repository.js";
import { beginTransaction } from "../../shared/config/database.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../bitacora/bitacora.service.js";

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
  idAsistencia,
  minutosAjustados,
  motivo,
  usuario,
) {
  if (usuario.Rol !== "GERENTE") {
    throw serviceError("Solo el gerente puede ajustar las horas extras", 403);
  }

  const asistenciaId = validateId(idAsistencia, "AsistenciaId");
  const actorId = validateId(usuario.UsuarioId, "UsuarioId");

  validarMinutosDetectados(minutosAjustados);

  const motivoValidado = validateText(motivo, "Motivo", 500, true);

  const restaurantePermitido = validateId(
    await getRestaurantePermitido(usuario),
    "Restaurante asignado",
  );

  const transaction = await beginTransaction();

  try {
    // 1. Buscar la asistencia y comprobar el restaurante.
    const asistencia = await asistenciasRepository.getAsistenciaById(
      asistenciaId,
      transaction,
    );

    if (!asistencia) {
      throw serviceError("La asistencia diaria no existe", 404);
    }

    if (asistencia.RestauranteId !== restaurantePermitido) {
      throw serviceError(
        "Solo podés ajustar las horas extras de tu restaurante",
        403,
      );
    }

    // 2. Comprobar que el período permita ajustes.
    const periodo = await periodoRepository.getPeriodoById(
      asistencia.PeriodoId,
      transaction,
    );

    if (!periodo) {
      throw serviceError("El período de planilla no existe", 404);
    }

    if (!["ABIERTO", "EN_REVISION"].includes(periodo.Estado)) {
      throw serviceError(
        "El período está cerrado o pagado y no permite ajustes",
        409,
      );
    }

    const { fechaHoy } = obtenerCalendarioActual();
    const fechaLimite = fechaSQLComoTexto(periodo.FechaLimiteAjustes);

    if (fechaHoy > fechaLimite) {
      throw serviceError(
        "El plazo para ajustar las horas de este período terminó",
        409,
      );
    }

    await validarDiaSinPermisoAprobado(asistencia.ColaboradorId, fechaSQLComoTexto(asistencia.FechaAsignada), transaction);
    await validarDiaSinIncapacidad(
      asistencia.ColaboradorId,
      asistencia.FechaAsignada,
      transaction,
    );
    // La asistencia guarda las horas normales; las extras se guardan aparte.
    // Quitar extras de una jornada corta no debe convertirla en ocho horas.
    const minutosNormales = minutosAjustados > 0
      ? 480
      : Math.min(asistencia.MinutosEfectivos, 480);
    validarMinutosDetectados(minutosNormales);

    if (minutosNormales !== asistencia.MinutosEfectivos) {
      const asistenciaActualizada = await asistenciasRepository.updateMinutosAsistencia(
        asistenciaId, minutosNormales, "Ajustados", transaction,
      );

      if (!asistenciaActualizada) {
        throw serviceError("No se pudieron ajustar las horas normales", 500);
      }
      
      await registrarBitacora({
        usuarioId: actorId,
        entidad: entidades.ASISTENCIAS_DIARIAS,
        registroId: asistenciaId,
        accion: acciones.AJUSTAR_HORAS,
        datosAnteriores: {
          minutosCalculados: asistencia.MinutosCalculados,
          minutosAjustados: asistencia.MinutosAjustados,
        },
        datosNuevos: {
          minutosCalculados: asistenciaActualizada.MinutosCalculados,
          minutosAjustados: minutosNormales,
          motivo: motivoValidado,
        },
      }, transaction);
    }

    // 4. Buscar el registro de extras.
    const registroAnterior =
      await horasExtraRepository.getHorasExtrasByAsistencia(
        asistenciaId,
        transaction,
      );

    // Si todavía no existe, crear su base automática.
    if (!registroAnterior) {
      const registroCreado = await horasExtraRepository.createHorasExtras(
        {
          asistenciaId,
          minutosDetectados: Math.max(0, asistencia.MinutosEfectivos - 480),
        },
        transaction,
      );

      if (!registroCreado) {
        throw serviceError("No se pudo crear el registro de horas extras", 500);
      }
    }

    // 5. Guardar el ajuste de extras en la misma transacción que las horas normales.
    const registroActualizado =
      await horasExtraRepository.updateMinutosExtrasAjustados(
        asistenciaId,
        minutosAjustados,
        transaction,
      );

    if (!registroActualizado) {
      throw serviceError("No se pudieron ajustar las horas extras", 500);
    }

    // 6. Registrar el cambio.
    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.HORAS_EXTRAS,
        registroId: registroActualizado.HoraExtraId,
        accion: registroAnterior ? acciones.AJUSTAR_HORAS : acciones.CREAR,

        datosAnteriores: registroAnterior
          ? {
              asistenciaId,
              minutosDetectados: registroAnterior.MinutosDetectados,
              minutosAjustados: registroAnterior.MinutosAjustados,
            }
          : null,

        datosNuevos: {
          asistenciaId,
          minutosDetectados: registroActualizado.MinutosDetectados,
          minutosAjustados: registroActualizado.MinutosAjustados,
          motivo: motivoValidado,
        },
      },
      transaction,
    );

    await transaction.commit();

    return {
      ...registroActualizado,
      MinutosEfectivos: minutosNormales,
      MinutosExtras:
        registroActualizado.MinutosAjustados ??
        registroActualizado.MinutosDetectados,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Error al revertir el ajuste de horas extras:",
        rollbackError,
      );
    }

    throw error;
  }
}

// Función interna: recibe la asistencia recién actualizada.
export async function sincronizarHorasExtras(
  asistencia,
  usuarioActorId,
  transaction,
  restablecerAjuste = false,
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

  // En marcas usamos el total calculado; en un ajuste manual, el total ingresado.
  // MinutosAjustados puede contener ya las ocho horas normales de otra sincronización.
  const minutosEfectivos = validarMinutosDetectados(
    restablecerAjuste
      ? (asistencia.MinutosAjustados ?? asistencia.MinutosCalculados)
      : asistencia.MinutosCalculados,
  );

  const minutosExtras = Math.max(0, minutosEfectivos - 480);
  const minutosNormales = minutosEfectivos - minutosExtras;

  const registroAnterior =
    await horasExtraRepository.getHorasExtrasByAsistencia(
      asistenciaId,
      transaction,
    );

  // Separar las horas normales incluso si las extras ya estaban guardadas.
  if (minutosExtras > 0 && asistencia.MinutosAjustados !== minutosNormales) {
    const asistenciaActualizada = await asistenciasRepository.updateMinutosAsistencia(
      asistenciaId, minutosNormales, "Ajustados", transaction,
    );
    
    if (!asistenciaActualizada) {
      throw serviceError("No se pudieron guardar las horas normales", 500);
    }

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.ASISTENCIAS_DIARIAS,
      registroId: asistenciaId,
      accion: acciones.ACTUALIZAR,
      datosAnteriores: { minutosAjustados: asistencia.MinutosAjustados },
      datosNuevos: { minutosAjustados: minutosNormales },
    }, transaction);

    // El llamador devuelve esta misma asistencia en su respuesta.
    asistencia.MinutosAjustados = minutosNormales;
  }

  // No necesitamos crear un registro sin horas extras.
  if (!registroAnterior && minutosExtras === 0) {
    return null;
  }

  // No hubo cambios en los minutos extras.
  if (
    registroAnterior &&
    registroAnterior.MinutosDetectados === minutosExtras &&
    !(restablecerAjuste && registroAnterior.MinutosAjustados != null)
  ) {
    return registroAnterior;
  }

  let registroGuardado;

  if (registroAnterior) {
    registroGuardado = await horasExtraRepository.updateMinutosExtras(
      asistenciaId,
      minutosExtras,
      transaction,
      restablecerAjuste,
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
      accion: registroAnterior ? acciones.ACTUALIZAR : acciones.CREAR,

      datosAnteriores: registroAnterior
        ? {
            asistenciaId,
            minutosDetectados: registroAnterior.MinutosDetectados,
            minutosAjustados: registroAnterior.MinutosAjustados,
          }
        : null,

      datosNuevos: {
        asistenciaId,
        minutosDetectados: registroGuardado.MinutosDetectados,
        minutosAjustados: registroGuardado.MinutosAjustados,
      },
    },
    transaction,
  );

  return registroGuardado;
}




/* SERVICES DE SOLICITUDES DE HORAS EXTRAS */

async function validarFechaPendiente(filtros) {
  const { fechaHoy } = obtenerCalendarioActual();
  await horasExtraRepository.rechazarSolicitudesVencidas(fechaHoy, filtros);
}

export async function getSolicitudById(id, usuario) {
  const solicitudId = validateId(id, "solicitudId");
  const solicitud = await horasExtraRepository.getSolicitudById(solicitudId);

  if (!solicitud)
    throw serviceError("Solicitud de horas extras no encontrada", 404);

  await validarAccesoSolicitud(solicitud, usuario);
  await validarFechaPendiente({ solicitudId });
  return horasExtraRepository.getSolicitudById(solicitudId);
}

export async function getSolicitudesByColaborador(
  colaboradorId,
  filtros = {},
  usuario,
) {
  const id = validateId(colaboradorId, "colaboradorId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);
  let restaurantePermitido = null;

  if (usuario.Rol === "COLABORADOR") {
    const colaboradorActualId = validateId(
      usuario.ColaboradorId,
      "ColaboradorId",
    );

    if (id !== colaboradorActualId) {
      throw serviceError("Solo podés consultar tus propias solicitudes.", 403);
    }
  } else if (usuario.Rol === "GERENTE") {
    restaurantePermitido = await getRestaurantePermitido(usuario);
  }

  await validarFechaPendiente({ colaboradorId: id, restauranteId: restaurantePermitido });
  const solicitudes = await horasExtraRepository.getSolicitudesByColaborador(id, filtrosValidados);
  return restaurantePermitido === null ? solicitudes : solicitudes.filter(
    (solicitud) => solicitud.RestauranteId === restaurantePermitido,
  );
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
  const restauranteConsultaId = await validarRestauranteSolicitudes(
    restauranteSolicitado,
    usuario,
  );

  const filtrosValidados = validarFiltrosSolicitudes(filtros);
  await validarFechaPendiente({ restauranteId: restauranteConsultaId });


  return horasExtraRepository.getSolicitudesByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
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
  const validFecha = validarFechaSolicitudFutura(fechaSolicitada, "Fecha solicitada");
  const validMinutosSolicitados = validarMinutosSolicitados(minutosSolicitados);
  const validMotivo = validateText(motivo, "El motivo", 500);

  const colaboradorActual = await getColaborador(colaboradorId, usuario);
  if (!colaboradorActual.Activo) {
    throw serviceError("El colaborador actual no existe o no esta activo", 403);
  }

  const transaction = await beginTransaction();

  try {
    // Bloquear antes de consultar protege incluso cuando no hay solicitudes.
    await bloquearColaboradorSolicitudes(colaboradorId, transaction);
    const existente = await horasExtraRepository.obtenerSolicitudesByFechaAndID(
      validFecha, colaboradorId, transaction,
    );

    if (existente) {
      throw serviceError("Ya tenés una solicitud de horas extras para esa fecha.", 409);
    }
    
    const solicitudCreada = await horasExtraRepository.createSolicitud(
      {
        registradoPorUsuarioId: usuarioId,
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
  if (usuario?.Rol !== "GERENTE") {
    throw serviceError(
      "No tiene permisos para resolver solicitudes de horas extras",
      403,
    );
  }

  const solicitudId = validateId(idSolicitud, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "usuarioId");
  const validEstado = validarEstadoResolucion(estado, "El estado");

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

  await validarAccesoSolicitud(
    solicitudActual,
    usuario,
    "Solo podés resolver solicitudes de tu restaurante",
  );

  validarFechaResolucion(solicitudActual.FechaSolicitada);
  validarSolicitudPendiente(solicitudActual);

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
    validEstado === "APROBADA"
      ? acciones.APROBAR_HORAS_EXTRA
      : acciones.RECHAZAR_HORAS_EXTRA;

  const transaction = await beginTransaction();

  try {
    const solicitudResuelta = await horasExtraRepository.resolverSolicitud(
      solicitudId,
      {
        estado: validEstado,
        minutosAutorizados: validMinutosAutorizados,
        revisadoPorGerenteId: usuarioId,
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
        entidad: entidades.SOLICITUDES,
        registroId: solicitudResuelta.SolicitudId,
        accion: accionBitacora,
        datosAnteriores: solicitudActual,
        datosNuevos: solicitudResuelta,
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
