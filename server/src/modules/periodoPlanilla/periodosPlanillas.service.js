import * as periodoRepository from "./periodosPlanillas.repository.js";

import {
  validateId,
  validateText,
  validateDate,
  serviceError,
} from "../../shared/utils/serviceUtils.js";
import {
  fechaSQLComoTexto,
  obtenerCalendarioActual,
} from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../bitacora/bitacora.service.js";

export async function listarPeriodos() {
  return periodoRepository.getPeriodos();
}

export async function obtenerPeriodo(idPeriodo) {
  const periodoId = validateId(idPeriodo);
  const periodo = await periodoRepository.getPeriodoById(periodoId);
  if (!periodo) {
    throw serviceError("El período seleccionado no existe.", 404);
  }

  return periodo;
}

export async function obtenerPeriodoPorFecha(fechaAsignada) {
  const fecha = validateDate(fechaAsignada, "La fecha asignada");
  const periodo = await periodoRepository.getPeriodoByFecha(fecha);

  if (!periodo) {
    throw serviceError("No existe un período para la fecha asignada", 404);
  }

  return periodo;
}

// Respetando las horas de las marcas y el corte a las 4am
export async function obtenerPeriodoActual() {
  const { fechaAsignada } = obtenerCalendarioActual();
  return await obtenerPeriodoPorFecha(fechaAsignada);
}

export async function crearPeriodo(periodo, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "El identificador del usuario");
  const camposFecha = [
    "fechaInicio",
    "fechaFin",
    "fechaPago",
    "fechaLimiteAjustes",
  ];

  const fechasValidadas = Object.fromEntries(
    camposFecha.map((campo) => [campo, validateDate(periodo?.[campo], campo)]),
  );

  const { fechaInicio, fechaFin, fechaPago, fechaLimiteAjustes } =
    fechasValidadas;

  if (
    fechaFin < fechaInicio ||
    fechaFin > fechaPago ||
    fechaLimiteAjustes < fechaFin ||
    fechaPago <= fechaLimiteAjustes
  ) {
    throw serviceError(
      "Las fechas no son coherentes para la creacion de la planilla",
    );
  }

  const transaction = await beginTransaction();

  try {
    if (
      await periodoRepository.existeSuperposicion(
        fechaInicio,
        fechaFin,
        transaction,
      )
    )
      throw serviceError("Las fechas coinciden con un período existente", 409);

    const periodoValidado = {
      fechaInicio,
      fechaFin,
      fechaPago,
      fechaLimiteAjustes,
      creadoPorUsuarioId: actorId,
    };

    const createdPeriodo = await periodoRepository.createPeriodo(
      periodoValidado,
      transaction,
    );

    if (!createdPeriodo) {
      throw serviceError("No se pudo crear el período", 500);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.PERIODOS_PLANILLA,
        registroId: createdPeriodo.PeriodoId,
        accion: acciones.CREAR,
        datosNuevos: createdPeriodo,
        datosAnteriores: null,
      },
      transaction,
    );

    await transaction.commit();
    return createdPeriodo;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error(`Error al hacer RollBack ${error}`);
    }
    throw error;
  }
}

export async function cambiarEstadoPeriodo(
  idPeriodo,
  nuevoEstado,
  usuarioActorId,
) {
  const actorId = validateId(usuarioActorId);
  const periodoId = validateId(idPeriodo);
  const nuevoState = validateText(nuevoEstado, "El estado", 15);

  if (nuevoState !== "PAGADO") {
    throw serviceError("Solo se permite confirmar manualmente el pago de un período cerrado.", 409);
  }

  const { fechaHoy } = obtenerCalendarioActual();

  const transaction = await beginTransaction();

  try {
    const periodoActual = await periodoRepository.getPeriodoById(
      periodoId,
      transaction,
    );
    if (!periodoActual) {
      throw serviceError("El periodo de planilla no fue encontrada", 404);
    }

    if (periodoActual.Estado !== "CERRADO") {
      throw serviceError(
        `No se puede pasar de ${periodoActual.Estado} a ${nuevoState}`,
        409,
      );
    }

    const fechaPago = fechaSQLComoTexto(periodoActual.FechaPago);
    if (fechaHoy < fechaPago)
      throw serviceError("Todavía no ha llegado la fecha de pago", 409);

    const updatedPeriodo = await periodoRepository.updateEstadoPeriodo(
      periodoId,
      periodoActual.Estado,
      nuevoState,
      transaction,
    );

    if (!updatedPeriodo) {
      throw serviceError(
        "El período cambió mientras se procesaba la solicitud. Volvé a consultarlo.",
        409,
      );
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.PERIODOS_PLANILLA,
        registroId: periodoId,
        accion: acciones.ACTUALIZAR,
        datosNuevos: updatedPeriodo,
        datosAnteriores: periodoActual,
      },
      transaction,
    );

    await transaction.commit();
    return updatedPeriodo;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error(`Error al hacer RollBack ${error}`);
    }
    throw error;
  }
}


/* FUNCIONES PARA AUTOMATIZAR LOS ESTADOS */
export function determinarEstadoPeriodo(periodo, calendario) {
  if (["CERRADO", "PAGADO"].includes(periodo.Estado)) return periodo.Estado;
  const fechaInicio = fechaSQLComoTexto(periodo.FechaInicio);
  const fechaFin = fechaSQLComoTexto(periodo.FechaFin);
  const fechaLimite = fechaSQLComoTexto(periodo.FechaLimiteAjustes);

  if (calendario.fechaAsignada < fechaInicio) {
    return "PROGRAMADO";
  }

  if (calendario.fechaAsignada <= fechaFin) {
    return "ABIERTO";
  }

  if (calendario.fechaHoy <= fechaLimite) {
    return "EN_REVISION";
  }

  return "CERRADO";
}

export async function actualizarEstadosPeriodos(usuarioSistemaId) {
  const usuarioId = validateId(
    usuarioSistemaId,
    "Usuario del sistema",
  );

  const calendario = obtenerCalendarioActual();
  const transaction = await beginTransaction();

  try {
    const periodos = await periodoRepository.getPeriodos(transaction);
    let cantidadActualizados = 0;

    const ordenEstados = {
      PROGRAMADO: 0,
      ABIERTO: 1,
      EN_REVISION: 2,
      CERRADO: 3,
      PAGADO: 4,
    };

    for (const periodo of periodos) {
      // La tarea nunca reabre períodos cerrados ni pagados.
      if (["CERRADO", "PAGADO"].includes(periodo.Estado)) {
        continue;
      }

      const nuevoEstado = determinarEstadoPeriodo(
        periodo,
        calendario,
      );

      // Solo avanzar; nunca retroceder ni repetir un cambio.
      if (
        ordenEstados[nuevoEstado] <= ordenEstados[periodo.Estado]
      ) {
        continue;
      }

      const periodoActualizado =
        await periodoRepository.updateEstadoPeriodo(
          periodo.PeriodoId,
          periodo.Estado,
          nuevoEstado,
          transaction,
        );

      // Otro proceso pudo cambiar el estado mientras tanto.
      if (!periodoActualizado) {
        continue;
      }

      await registrarBitacora(
        {
          usuarioId,
          entidad: entidades.PERIODOS_PLANILLA,
          registroId: periodo.PeriodoId,
          accion: acciones.ACTUALIZAR,
          datosAnteriores: {
            estado: periodo.Estado,
          },
          datosNuevos: {
            estado: periodoActualizado.Estado,
            origen: "AUTOMATICO",
          },
        },
        transaction,
      );

      cantidadActualizados++;
    }

    await transaction.commit();
    return cantidadActualizados;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la actualización de períodos:",
        rollbackError,
      );
    }

    throw error;
  }
}
