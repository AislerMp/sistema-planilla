import * as incapacidadesRepository from "../incapacidades.repository.js";
import * as calculosRepository from "../calculoIncapacidades.repository.js";
import * as periodoRepository from "../../periodoPlanilla/periodosPlanillas.repository.js";

import * as saldosRepository from "../../vacaciones/repositorios/saldosVacaciones.repository.js";
import * as asistenciasRepository from "../../asistenciasDiarias/asistenciasDiarias.repository.js";

import {
  getAsistenciaByColaboradorYFecha,
  updateMinutosAsistencia,
} from "../../asistenciasDiarias/asistenciasDiarias.repository.js";
import { sincronizarHorasExtras } from "../../extras/horasExtras.service.js";
import {
  serviceError,
  validateId,
  validateDate,
} from "../../../shared/utils/serviceUtils.js";
import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../../shared/utils/fechaUtils.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";

export async function calcularReconocimientoIncapacidad(
  incapacidad,
  tipoIncapacidad,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para calcular el reconocimiento.",
      500,
    );
  }

  if (!incapacidad || !tipoIncapacidad) {
    throw serviceError("Faltan los datos de la incapacidad o de su tipo.", 500);
  }

  validateId(incapacidad.ColaboradorId, "ColaboradorId");

  if (incapacidad.TipoIncapacidadId !== tipoIncapacidad.TipoIncapacidadId) {
    throw serviceError(
      "El tipo consultado no corresponde a la incapacidad.",
      409,
    );
  }

  const { FechaInicio, FechaFin } = incapacidad;

  if (
    !(FechaInicio instanceof Date) ||
    !(FechaFin instanceof Date) ||
    Number.isNaN(FechaInicio.getTime()) ||
    Number.isNaN(FechaFin.getTime())
  ) {
    throw serviceError(
      "Las fechas almacenadas de la incapacidad no son válidas.",
      500,
    );
  }

  if (FechaFin < FechaInicio) {
    throw serviceError(
      "La fecha final no puede ser anterior a la fecha inicial.",
      409,
    );
  }

  const porcentajePatronal = tipoIncapacidad.PorcentajePatronal;

  if (
    !Number.isFinite(porcentajePatronal) ||
    porcentajePatronal < 0 ||
    porcentajePatronal > 100
  ) {
    throw serviceError(
      "El porcentaje patronal configurado debe estar entre 0 y 100.",
      500,
    );
  }

  switch (tipoIncapacidad.Codigo) {
    case "ENFERMEDAD_CCSS":
      return calcularReconocimientoEnfermedad(
        incapacidad,
        porcentajePatronal,
        transaction,
      );

    case "RIESGO_TRABAJO_INS":
      return calcularReconocimientoRiesgoTrabajo(porcentajePatronal);

    case "MATERNIDAD_CCSS":
      throw serviceError(
        "La maternidad debe utilizar su registro de reconocimiento por períodos.",
        409,
      );

    default:
      throw serviceError(
        "El cálculo para este tipo de incapacidad todavía no está implementado.",
        409,
      );
  }
}

async function calcularReconocimientoEnfermedad(
  incapacidad,
  porcentajePatronal,
  transaction,
) {
  const colaboradorId = incapacidad.ColaboradorId;
  const fechaInicio = incapacidad.FechaInicio;
  const fechaFin = incapacidad.FechaFin;

  // Regla definida para el proyecto.
  const milisegundosPorDia = 24 * 60 * 60 * 1000;
  const duracionVentanaDias = 30;
  const maximoDiasReconocibles = 3;
  const minutosBaseDiaria = 8 * 60;

  const antecedentes =
    await calculosRepository.getIncapacidadesAprobadasAnteriores(
      colaboradorId,
      fechaInicio,
      transaction,
    );

  const antecedentesEnfermedad = antecedentes.filter(
    (anterior) => anterior.CodigoTipoIncapacidad === "ENFERMEDAD_CCSS",
  );

  antecedentesEnfermedad.sort(
    (a, b) => a.FechaInicio.getTime() - b.FechaInicio.getTime(),
  );

  let inicioVentana = null;
  let diasReconocidosVentana = 0;

  function reconocerDia(dia) {
    const terminoVentana =
      inicioVentana !== null &&
      dia - inicioVentana >= duracionVentanaDias * milisegundosPorDia;

    if (inicioVentana === null || terminoVentana) {
      inicioVentana = dia;
      diasReconocidosVentana = 0;
    }

    if (diasReconocidosVentana >= maximoDiasReconocibles) {
      return false;
    }

    diasReconocidosVentana++;
    return true;
  }

  for (const anterior of antecedentesEnfermedad) {
    for (
      let dia = anterior.FechaInicio.getTime();
      dia <= anterior.FechaFin.getTime();
      dia += milisegundosPorDia
    ) {
      reconocerDia(dia);
    }
  }

  let diasReconociblesActuales = 0;

  for (
    let dia = fechaInicio.getTime();
    dia <= fechaFin.getTime();
    dia += milisegundosPorDia
  ) {
    if (reconocerDia(dia)) {
      diasReconociblesActuales++;
    }
  }

  const minutosReconocidos = Math.round(
    diasReconociblesActuales * minutosBaseDiaria * (porcentajePatronal / 100),
  );

  return {
    minutosReconocidos,
    porcentajePatronalAplicado: porcentajePatronal,
  };
}

function calcularReconocimientoRiesgoTrabajo(porcentajePatronal) {
  if (porcentajePatronal !== 0) {
    throw serviceError(
      "El tipo de riesgos del trabajo debe tener un porcentaje patronal de cero para este cálculo.",
      500,
    );
  }

  return {
    minutosReconocidos: 0,
    porcentajePatronalAplicado: porcentajePatronal,
  };
}

export async function registrarCalculoIncapacidad(
  incapacidad,
  reconocimiento,
  transaction,
  usuarioActorId,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el cálculo de incapacidad.",
      500,
    );
  }

  if (!incapacidad || !reconocimiento) {
    throw serviceError(
      "Faltan los datos necesarios para registrar el cálculo de incapacidad.",
      500,
    );
  }

  const solicitudId = validateId(incapacidad.SolicitudId, "SolicitudId");
  const actorId = validateId(usuarioActorId, "UsuarioId");

  const { minutosReconocidos, porcentajePatronalAplicado } = reconocimiento;

  if (
    !Number.isInteger(minutosReconocidos) ||
    minutosReconocidos < 0 ||
    minutosReconocidos > 2147483647
  ) {
    throw serviceError(
      "El cálculo debe generar minutos reconocidos enteros y no negativos.",
      500,
    );
  }

  if (
    !Number.isFinite(porcentajePatronalAplicado) ||
    porcentajePatronalAplicado < 0 ||
    porcentajePatronalAplicado > 100
  ) {
    throw serviceError(
      "El porcentaje patronal calculado debe estar entre 0 y 100.",
      500,
    );
  }

  // Comprobar el duplicado antes de modificar las horas.
  const calculosExistentes = await calculosRepository.getCalculosBySolicitud(
    solicitudId,
    transaction,
  );

  if (calculosExistentes.length > 0) {
    throw serviceError(
      "La solicitud de incapacidad ya tiene un cálculo registrado.",
      409,
    );
  }

  const solicitudActual = await incapacidadesRepository.getSolicitudById(
    solicitudId,
    transaction,
  );

  if (solicitudActual.Estado !== "APROBADA") {
    throw serviceError(
      "La incapacidad debe estar aprobada para registrar su cálculo.",
      409,
    );
  }

  // El reconocimiento se asigna al período de la fecha de aprobación.
  const { fechaAsignada, fechaHoy } = obtenerCalendarioActual();
  const fechaValida = validateDate(fechaAsignada, "Fecha asignada actual");

  const periodoActual = await periodoRepository.getPeriodoByFecha(
    fechaValida,
    transaction,
  );

  if (!periodoActual) {
    throw serviceError(
      "No existe un período de planilla para asignar el reconocimiento.",
      409,
    );
  }

  if (
    periodoActual.Estado !== "ABIERTO" &&
    periodoActual.Estado !== "EN_REVISION"
  ) {
    throw serviceError(
      "El período actual no está abierto y no permite asignar nuevos cálculos de incapacidad.",
      409,
    );
  }

  await invalidarHorasTrabajadasAsistencia(
    solicitudActual,
    transaction,
    fechaHoy,
    actorId,
  );

  const calculoIncapacidadCreado =
    await calculosRepository.createCalculoIncapacidad(
      {
        solicitudId,
        periodoId: periodoActual.PeriodoId,
        minutosReconocidos,
        porcentajePatronalAplicado,
      },
      transaction,
    );

  if (!calculoIncapacidadCreado) {
    throw serviceError("No se pudo registrar el cálculo de incapacidad.", 409);
  }

  return calculoIncapacidadCreado;
}

async function invalidarHorasTrabajadasAsistencia(
  solicitudActual,
  transaction,
  fechaHoy,
  actorId,
) {
  // Buscar la asistencia del primer día de la incapacidad.
  const asistenciaDiariaActual = await getAsistenciaByColaboradorYFecha(
    solicitudActual.ColaboradorId,
    solicitudActual.FechaInicio,
    transaction,
  );

  if (asistenciaDiariaActual) {
    // Este período puede ser diferente al del reconocimiento.
    const periodoAsistencia = await periodoRepository.getPeriodoById(
      asistenciaDiariaActual.PeriodoId,
      transaction,
    );

    const permiteAjustes =
      ["ABIERTO", "EN_REVISION"].includes(periodoAsistencia.Estado) &&
      fechaHoy <= fechaSQLComoTexto(periodoAsistencia.FechaLimiteAjustes);

    // Si el período ya no permite ajustes, las horas quedan intactas.
    if (permiteAjustes) {
      const newAsistencia = await updateMinutosAsistencia(
        asistenciaDiariaActual.AsistenciaId,
        0,
        "Ajustados",
        transaction,
      );

      if (!newAsistencia) {
        throw serviceError(
          "No se pudieron ajustar las horas por incapacidad.",
          409,
        );
      }

      await sincronizarHorasExtras(newAsistencia, actorId, transaction, true);

      await registrarBitacora(
        {
          usuarioId: actorId,
          entidad: entidades.ASISTENCIAS_DIARIAS,
          registroId: asistenciaDiariaActual.AsistenciaId,
          accion: acciones.ACTUALIZAR,

          datosAnteriores: {
            minutosCalculados: asistenciaDiariaActual.MinutosCalculados,
            minutosAjustados: asistenciaDiariaActual.MinutosAjustados,
          },

          datosNuevos: {
            minutosCalculados: newAsistencia.MinutosCalculados,
            minutosAjustados: newAsistencia.MinutosAjustados,
            solicitudId: solicitudActual.SolicitudId,
            motivo: "Horas ajustadas a cero por incapacidad aprobada por RH.",
          },
        },
        transaction,
      );
    }
  }
}

function validarFechaAlmacenada(fecha, campo) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw serviceError(`${campo} almacenada no es válida.`, 500);
  }
  return validateDate(fechaSQLComoTexto(fecha), campo);
}

export async function registrarReconocimientoMaternidad(
  incapacidad,
  tipoIncapacidad,
  usuarioActorId,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar maternidad.",
      500,
    );
  }

  if (!incapacidad || !tipoIncapacidad) {
    throw serviceError(
      "Faltan los datos necesarios para registrar maternidad.",
      500,
    );
  }

  const solicitudId = validateId(incapacidad.SolicitudId, "SolicitudId");
  const colaboradorId = validateId(
    incapacidad.ColaboradorId,
    "ColaboradorId",
  );

  const actorId = validateId(usuarioActorId, "UsuarioId");

  if (
    tipoIncapacidad.Codigo !== "MATERNIDAD_CCSS" ||
    tipoIncapacidad.TipoIncapacidadId !== incapacidad.TipoIncapacidadId
  ) {
    throw serviceError(
      "El tipo seleccionado no corresponde a maternidad.",
      409,
    );
  }

  const porcentajePatronal = tipoIncapacidad.PorcentajePatronal;
  if (
    !Number.isFinite(porcentajePatronal) ||
    porcentajePatronal < 0 ||
    porcentajePatronal > 100
  ) {
    throw serviceError(
      "El porcentaje patronal configurado debe estar entre 0 y 100.",
      500,
    );
  }

  const fechaInicio = validarFechaAlmacenada(
    incapacidad.FechaInicio,
    "Fecha de inicio",
  );

  const fechaFin = validarFechaAlmacenada(
    incapacidad.FechaFin,
    "Fecha de fin",
  );

  if (fechaFin < fechaInicio) {
    throw serviceError(
      "La fecha final no puede ser anterior a la inicial.",
      409,
    );
  }

  const solicitudActual = await incapacidadesRepository.getSolicitudById(
    solicitudId,
    transaction,
  );

  if (!solicitudActual || solicitudActual.Estado !== "APROBADA") {
    throw serviceError(
      "La solicitud debe existir y estar aprobada para registrar maternidad.",
      409,
    );
  }

  const calculosExistentes = await calculosRepository.getCalculosBySolicitud(
    solicitudId,
    transaction,
  );

  if (calculosExistentes.length > 0) {
    throw serviceError(
      "La solicitud ya tiene un reconocimiento registrado.",
      409,
    );
  }

  const saldo = await saldosRepository.getSaldoByColaborador(
    colaboradorId,
    transaction,
  );

  if (!saldo) {
    throw serviceError(
      "El colaborador no tiene un saldo de vacaciones inicializado.",
      409,
    );
  }

  const acumuladoActual = Number(saldo.DiasAcumulados);
  if (!Number.isFinite(acumuladoActual)) {
    throw serviceError("El saldo acumulado de vacaciones contiene un valor inválido.", 500);
  }

  const milisegundosPorDia = 24 * 60 * 60 * 1000;
  const minutosBaseDiaria = 480;
  const factorVacaciones = 0.04;
  
  const { fechaHoy } = obtenerCalendarioActual();

  const totalDias =
    (fechaFin.getTime() - fechaInicio.getTime()) /
      milisegundosPorDia +
    1;

  /*
   * Buscar días de la licencia que ya pudieron aportar vacaciones
   * mediante las asistencias. Se consulta antes de poner horas en cero.
   */
  const fechaProcesada = validarFechaAlmacenada(
    saldo.FechaAcumuladaHasta,
    "Última fecha acumulada",
  );

  const finYaProcesado = new Date(
    Math.min(fechaFin.getTime(), fechaProcesada.getTime()),
  );

  const fechasYaContadas = new Set();

  if (fechaInicio <= finYaProcesado) {
    const asistencias =
      await asistenciasRepository.getAsistenciasByColaborador(
        colaboradorId,
        {
          desde: fechaInicio,
          hasta: finYaProcesado,
        },
        transaction,
      );

    for (const asistencia of asistencias) {
      if (
        asistencia.MinutosEfectivos > 0 &&
        asistencia.FechaAsignada >= fechaInicio &&
        asistencia.FechaAsignada <= finYaProcesado
      ) {
        fechasYaContadas.add(
          fechaSQLComoTexto(asistencia.FechaAsignada),
        );
      }
    }
  }

  // Registrar el reconocimiento salarial de cada período.
  const calculosCreados = [];
  let totalMinutos = 0;
  let fechaPendiente = new Date(fechaInicio);

  while (fechaPendiente <= fechaFin) {
    const periodo = await periodoRepository.getPeriodoByFecha(
      fechaPendiente,
      transaction,
    );

    if (!periodo) {
      throw serviceError(
        `No existe un período para el ${fechaSQLComoTexto(fechaPendiente)}.`,
        409,
      );
    }

    validateId(periodo.PeriodoId, "PeriodoId");
    const fechaInicioPeriodo = validarFechaAlmacenada(
      periodo.FechaInicio, "Fecha inicial del período",
    );
    const fechaFinPeriodo = validarFechaAlmacenada(
      periodo.FechaFin, "Fecha final del período",
    );
    const fechaLimiteAjustes = validarFechaAlmacenada(
      periodo.FechaLimiteAjustes, "Fecha límite de ajustes",
    );

    if (
      !["PROGRAMADO", "ABIERTO", "EN_REVISION"].includes(periodo.Estado) ||
      fechaHoy > fechaSQLComoTexto(fechaLimiteAjustes)
    ) {
      throw serviceError(
        `El período ${periodo.PeriodoId} ya no permite registrar el reconocimiento de maternidad.`,
        409,
      );
    }

    if (fechaInicioPeriodo > fechaPendiente || fechaFinPeriodo < fechaPendiente) {
      throw serviceError(
        "Las fechas del período consultado no son coherentes.",
        500,
      );
    }

    const fechaFinReconocida = new Date(
      Math.min(fechaFinPeriodo.getTime(), fechaFin.getTime()),
    );

    const diasReconocidos =
      (fechaFinReconocida.getTime() - fechaPendiente.getTime()) /
        milisegundosPorDia +
      1;

    const minutosReconocidos = Math.round(
      diasReconocidos * minutosBaseDiaria * (porcentajePatronal / 100),
    );

    const calculoCreado = await calculosRepository.createCalculoIncapacidad(
      {
        solicitudId,
        periodoId: periodo.PeriodoId,
        minutosReconocidos,
        porcentajePatronalAplicado: porcentajePatronal,
      },
      transaction,
    );

    if (!calculoCreado) {
      throw serviceError(
        `No se pudo registrar el cálculo del período ${periodo.PeriodoId}.`,
        409,
      );
    }

    calculosCreados.push({
      ...calculoCreado,
      fechaInicioReconocida: fechaSQLComoTexto(fechaPendiente),
      fechaFinReconocida: fechaSQLComoTexto(fechaFinReconocida),
      diasReconocidos,
    });

    totalMinutos += minutosReconocidos;

    fechaPendiente = new Date(fechaFinReconocida);
    fechaPendiente.setUTCDate(fechaPendiente.getUTCDate() + 1);
  }

  // Acreditar toda la licencia, descontando los días ya contabilizados.
  const diasPorAcreditar = totalDias - fechasYaContadas.size;

  const aporteVacaciones = Number(
    (diasPorAcreditar * factorVacaciones).toFixed(2),
  );

  const nuevoAcumulado = Number(
    (acumuladoActual + aporteVacaciones).toFixed(2),
  );

  const saldoActualizado = await saldosRepository.updateDiasAcumulados(
    colaboradorId,
    nuevoAcumulado,
    saldo.FechaAcumuladaHasta,
    transaction,
  );

  if (!saldoActualizado) {
    throw serviceError(
      "No se pudo acreditar el saldo de vacaciones por maternidad.",
      409,
    );
  }

  await registrarBitacora(
    {
      usuarioId: actorId,
      entidad: entidades.SALDOS_VACACIONES,
      registroId: colaboradorId,
      accion: acciones.ACTUALIZAR,
      datosAnteriores: saldo,
      datosNuevos: {
        ...saldoActualizado,
        solicitudId,
        diasLicencia: totalDias,
        diasYaContabilizados: fechasYaContadas.size,
        aporteVacaciones,
        motivo: "Acreditación anticipada por licencia de maternidad.",
      },
    },
    transaction,
  );

  // Reutilizar el ajuste del primer día que ya implementamos.
  await invalidarHorasTrabajadasAsistencia(
    solicitudActual,
    transaction,
    fechaHoy,
    actorId,
  );

  return {
    calculos: calculosCreados,
    diasReconocidos: totalDias,
    minutosReconocidos: totalMinutos,
    porcentajePatronalAplicado: porcentajePatronal,
    aporteVacaciones,
    saldoVacaciones: saldoActualizado,
  };
}
