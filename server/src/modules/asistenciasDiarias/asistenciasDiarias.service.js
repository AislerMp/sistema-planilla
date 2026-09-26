import {
  validateId,
  validateDate,
  serviceError,
  validateText,
} from "../../shared/utils/serviceUtils.js";

import * as asistenciasRepository from "./asistenciasDiarias.repository.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { registrarBitacora, entidades } from "../bitacora/bitacora.service.js";

import { getRestaurantePermitido } from "../colaboradores/colaboradores.service.js";
import { sincronizarHorasExtras } from "../extras/horasExtras.service.js";
import { beginTransaction } from "../../shared/config/database.js";

export async function obtenerAsistencia(id) {
  const validId = validateId(id);
  const asistenciaObj = await asistenciasRepository.getAsistenciaById(validId);

  if (!asistenciaObj)
    throw serviceError("Asistencia del dia no encontrado", 404);

  return asistenciaObj;
}

export async function obtenerAsistenciaPorColaboradorYfecha(
  colaboradorId,
  fechaAsignada,
) {
  const validColabId = validateId(colaboradorId);
  const validfechaAsignada = validateDate(fechaAsignada, "Fecha asignada");

  const asistenciaObj =
    await asistenciasRepository.getAsistenciaByColaboradorYFecha(
      validColabId,
      validfechaAsignada,
    );

  if (!asistenciaObj)
    throw serviceError("Dia de asistencia no ha sido encontrada", 404);

  return asistenciaObj;
}

// Funcion explicitamente para el colaborador
export async function listarAsistenciasPorColaborador(
  colaboradorId,
  filtros = {},
) {
  let fechaDesde = validateDate(filtros?.desde, "Fecha desde", true);
  const fechaHasta = validateDate(filtros?.hasta, "Fecha hasta", true);
  const periodoId = validateId(filtros?.periodoId, "periodoId", true);
  const validColaboradorId = validateId(colaboradorId);

  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw serviceError(
      "La fecha desde no puede ser mayor que la fecha hasta",
      400,
    );
  }

  if (!fechaDesde && !fechaHasta && !periodoId) {
    throw serviceError("Debe aplicar al menos un filtro", 400);
  }

  // Si solo se indica fechaHasta, buscar únicamente ese día.
  if (!fechaDesde && fechaHasta) {
    fechaDesde = fechaHasta;
  }

  const asistenciasFiltered =
    await asistenciasRepository.getAsistenciasByColaborador(
      validColaboradorId,
      {
        desde: fechaDesde,
        hasta: fechaHasta,
        periodoId,
      },
    );

  if (asistenciasFiltered.length === 0) {
    throw serviceError("Asistencias no encontradas", 404);
  }

  return asistenciasFiltered;
}

//Gerente Valida por su propio Restaurante
export async function listarAsistenciasPorRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  if (!usuario) throw serviceError("Debe iniciar sesión", 401);
  if (!["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario.Rol)) {
    throw serviceError("No tiene permisos para consultar asistencias del restaurante", 403);
  }

  let fechaDesde = validateDate(filtros?.desde, "Fecha desde", true);
  const fechaHasta = validateDate(filtros?.hasta, "Fecha hasta", true);
  const periodoId = validateId(filtros?.periodoId, "periodoId", true);

  const restauranteSolicitado = validateId(
    restauranteId,
    "restauranteId",
    true,
  );
  // SOLO GERENTE
  const restaurantePermitido = await getRestaurantePermitido(usuario);

  if (
    restaurantePermitido !== null &&
    restauranteSolicitado !== null &&
    restauranteSolicitado !== restaurantePermitido
  ) {
    throw serviceError(
      "Solo podés consultar asistencias de tu restaurante asignado.",
      403,
    );
  }

  const restauranteConsultaId = restaurantePermitido ?? restauranteSolicitado;
  if (restauranteConsultaId === null) {
    throw serviceError("Debe indicar el restaurante que desea consultar", 400);
  }

  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw serviceError(
      "La fecha desde no puede ser mayor que la fecha hasta",
      400,
    );
  }

  if (!fechaDesde && !fechaHasta && !periodoId) {
    throw serviceError("Debe aplicar al menos un filtro", 400);
  }

  // Solo hasta significa únicamente ese día.
  if (!fechaDesde && fechaHasta) {
    fechaDesde = fechaHasta;
  }

  const asistencias = await asistenciasRepository.getAsistenciasByRestaurante(
    restauranteConsultaId,
    {
      desde: fechaDesde,
      hasta: fechaHasta,
      periodoId,
    },
  );

  if (asistencias.length === 0) {
    throw serviceError("No se encontraron asistencias", 404);
  }

  return asistencias;
}

export async function crearAsistenciaDiaria(
  colaborador,
  fechaAsignada,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para crear la asistencia",
      500,
    );
  }

  if (!colaborador) {
    throw serviceError("El colaborador no existe", 404);
  }

  if (!colaborador.Activo) {
    throw serviceError("El colaborador está inactivo", 409);
  }

  const colaboradorId = validateId(colaborador.ColaboradorId, "ColaboradorId");

  const restauranteId = validateId(colaborador.RestauranteId, "RestauranteId");

  const fecha = validateDate(fechaAsignada, "Fecha asignada");

  const periodo = await periodoRepository.getPeriodoByFecha(fecha, transaction);

  if (!periodo) {
    throw serviceError("No existe un período de planilla para esta fecha", 409);
  }

  if (periodo.Estado !== "ABIERTO") {
    throw serviceError(
      "El período de planilla no permite registrar nuevas marcas",
      409,
    );
  }

  const asistenciaExistente =
    await asistenciasRepository.getAsistenciaByColaboradorYFecha(
      colaboradorId,
      fecha,
      transaction,
    );

  if (asistenciaExistente) {
    throw serviceError(
      "El colaborador ya tiene una asistencia para esta fecha",
      409,
    );
  }

  const asistenciaCreada = await asistenciasRepository.createAsistenciaDiaria(
    {
      colaboradorId,
      restauranteId,
      periodoId: periodo.PeriodoId,
      fechaAsignada: fecha,
    },
    transaction,
  );

  if (!asistenciaCreada) {
    throw serviceError("No se pudo crear la asistencia diaria", 500);
  }

  return asistenciaCreada;
}

// El gerente es el que realiza el ajustes de las horas
export async function ajustarMinutosAsistencia(
  asistenciaId,
  minutos,
  motivo,
  usuario,
) {
  const actorId = validateId(usuario.UsuarioId, "UsuarioId");
  const validAsistenciaId = validateId(asistenciaId, "AsistenciaId");

  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 2147483647) {
    throw serviceError(
      "Los minutos deben ser un número entero entre 0 y 2147483647",
      400,
    );
  }

  const validMotivo = validateText(motivo, "Motivo", 500, true);

  const restaurantePermitido = validateId(
    await getRestaurantePermitido(usuario),
    "Restaurante asignado",
  );

  const transaction = await beginTransaction();

  try {
    const asistenciaAnterior = await asistenciasRepository.getAsistenciaById(
      validAsistenciaId,
      transaction,
    );

    if (!asistenciaAnterior) {
      throw serviceError("La asistencia diaria no existe", 404);
    }

    if (asistenciaAnterior.RestauranteId !== restaurantePermitido) {
      throw serviceError(
        "Solo podés ajustar asistencias de tu restaurante",
        403,
      );
    }

    const periodo = await periodoRepository.getPeriodoById(
      asistenciaAnterior.PeriodoId,
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

    // La fecha límite se permite completa.
    if (fechaHoy > fechaLimite) {
      throw serviceError(
        "El plazo para ajustar las horas de este período terminó",
        409,
      );
    }

    const asistenciaActualizada =
      await asistenciasRepository.updateMinutosAsistencia(
        validAsistenciaId,
        minutos,
        "Ajustados",
        transaction,
      );

    if (!asistenciaActualizada) {
      throw serviceError("La asistencia ya no existe", 404);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.ASISTENCIAS_DIARIAS,
        registroId: validAsistenciaId,
        accion: "AJUSTAR_HORAS",

        datosAnteriores: {
          minutosCalculados: asistenciaAnterior.MinutosCalculados,
          minutosAjustados: asistenciaAnterior.MinutosAjustados,
        },

        datosNuevos: {
          minutosCalculados: asistenciaActualizada.MinutosCalculados,
          minutosAjustados: asistenciaActualizada.MinutosAjustados,
          motivo: validMotivo,
        },
      },
      transaction,
    );

    await sincronizarHorasExtras(
      asistenciaActualizada,
      actorId,
      transaction,
    );

    await transaction.commit();

    return {
      ...asistenciaActualizada,
      MinutosEfectivos:
        asistenciaActualizada.MinutosAjustados ??
        asistenciaActualizada.MinutosCalculados,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Error al revertir el ajuste de asistencia:",
        rollbackError,
      );
    }

    throw error;
  }
}

// Explicitamente para la salida del colaborador
export async function actualizarMinutosCalculados(
  idAsistencia,
  totalMinutos,
  transaction,
  usuario,
) {
  const actorId = validateId(usuario.UsuarioId, "UsuarioId");
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const asistenciaId = validateId(idAsistencia, "AsistenciaId");

  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar los minutos",
      500,
    );
  }

  if (
    !Number.isInteger(totalMinutos) ||
    totalMinutos < 0 ||
    totalMinutos > 2147483647
  ) {
    throw serviceError(
      "El total de minutos debe ser un entero entre 0 y 2147483647",
      400,
    );
  }

  const asistenciaDiaria = await asistenciasRepository.getAsistenciaById(
    asistenciaId,
    transaction,
  );

  if (!asistenciaDiaria) {
    throw serviceError("La asistencia no existe", 404);
  }

  if (colaboradorId !== asistenciaDiaria.ColaboradorId) {
    throw serviceError(
      "La asistencia no pertenece al colaborador autenticado",
      403,
    );
  }

  const periodo = await periodoRepository.getPeriodoById(
    asistenciaDiaria.PeriodoId,
    transaction,
  );

  if (!periodo) {
    throw serviceError("El período de planilla no existe", 404);
  }
  if (periodo.Estado !== "ABIERTO") {
    throw serviceError("El período no está abierto para registrar marcas", 409);
  }

  const asistenciaActualizada =
    await asistenciasRepository.updateMinutosAsistencia(
      asistenciaId,
      totalMinutos,
      "Calculados",
      transaction,
    );

  if (!asistenciaActualizada) {
    throw serviceError("La asistencia ya no existe", 404);
  }

  await registrarBitacora(
    {
      usuarioId: actorId,
      entidad: entidades.ASISTENCIAS_DIARIAS,
      registroId: asistenciaId,
      accion: "ACTUALIZAR",

      datosAnteriores: {
        minutosCalculados: asistenciaDiaria.MinutosCalculados,
        minutosAjustados: asistenciaDiaria.MinutosAjustados,
      },

      datosNuevos: {
        minutosCalculados: asistenciaActualizada.MinutosCalculados,
        minutosAjustados: asistenciaActualizada.MinutosAjustados,
      },
    },
    transaction,
  );

  return asistenciaActualizada;
}
