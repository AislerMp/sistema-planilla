import { getPeriodoByFecha } from "../../periodoPlanilla/periodosPlanillas.repository.js";
import * as calculoVacacionesRepository from "../repositorios/calculosVacaciones.repository.js";
import { getVacacionSolicitudById } from "../repositorios/vacaciones.repository.js";
import {
  serviceError,
  validateDate,
  validateId,
} from "../../../shared/utils/serviceUtils.js";
import { fechaSQLComoTexto } from "../../../shared/utils/fechaUtils.js";

export async function registrarCalculoVacaciones(
  vacaciones,
  transaction,
  usuarioActorId,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el cálculo de vacaciones.",
      500,
    );
  }

  if (!vacaciones) {
    throw serviceError(
      "Faltan los datos necesarios para registrar el cálculo de vacaciones.",
      500,
    );
  }

  const solicitudId = validateId(vacaciones.SolicitudId, "SolicitudId");
  validateId(usuarioActorId, "UsuarioId");

  const calculosExistentes =
    await calculoVacacionesRepository.getCalculosBySolicitud(
      solicitudId,
      transaction,
    );

  if (calculosExistentes.length > 0) {
    throw serviceError(
      "La solicitud de vacaciones ya tiene cálculos registrados.",
      409,
    );
  }

  const solicitudActual = await getVacacionSolicitudById(
    solicitudId,
    transaction,
  );

  if (!solicitudActual) {
    throw serviceError("No se encontró la solicitud de vacaciones.", 404);
  }

  if (solicitudActual.Estado !== "APROBADA") {
    throw serviceError(
      "La solicitud de vacaciones debe estar aprobada para registrar su cálculo.",
      409,
    );
  }

  const fechaInicioVacaciones = validateDate(
    fechaSQLComoTexto(solicitudActual.FechaInicio),
    "Fecha de inicio de vacaciones",
  );
  const fechaFinVacaciones = validateDate(
    fechaSQLComoTexto(solicitudActual.FechaFin),
    "Fecha de fin de vacaciones",
  );
  const diasSolicitados = validateId(
    solicitudActual.DiasSolicitados,
    "Días solicitados",
  );
  const diasCalendario =
    Math.floor((fechaFinVacaciones - fechaInicioVacaciones) / 86_400_000) + 1;

  if (diasSolicitados !== diasCalendario) {
    throw serviceError(
      "Los días solicitados no coinciden con el rango de fechas de vacaciones.",
      409,
    );
  }

  // Se usa el período donde empiezan las vacaciones, no la fecha de aprobación.
  const periodoActual = await getPeriodoByFecha(
    fechaInicioVacaciones,
    transaction,
  );

  if (!periodoActual) {
    throw serviceError(
      "No existe un período de planilla para el inicio de las vacaciones.",
      409,
    );
  }

  let diasPeriodoActual = 0;
  let diasSiguientePeriodo = 0;
  const fechaFinPeriodoActual = new Date(periodoActual.FechaFin);

  for (let i = 0; i < diasSolicitados; i++) {
    const fechaDia = new Date(fechaInicioVacaciones);
    fechaDia.setUTCDate(fechaDia.getUTCDate() + i);

    if (fechaDia <= fechaFinPeriodoActual) {
      diasPeriodoActual++;
    } else {
      diasSiguientePeriodo++;
    }
  }

  const tramos = [
    {
      periodo: periodoActual,
      fechaInicio: fechaInicioVacaciones,
      fechaFin:
        diasSiguientePeriodo === 0
          ? fechaFinVacaciones
          : fechaFinPeriodoActual,
      dias: diasPeriodoActual,
    },
  ];

  if (diasSiguientePeriodo > 0) {
    const inicioSiguienteTramo = new Date(fechaFinPeriodoActual);
    inicioSiguienteTramo.setUTCDate(inicioSiguienteTramo.getUTCDate() + 1);

    const periodoSiguiente = await getPeriodoByFecha(
      inicioSiguienteTramo,
      transaction,
    );

    if (!periodoSiguiente) {
      throw serviceError(
        "No existe el siguiente período para distribuir las vacaciones.",
        409,
      );
    }

    if (fechaFinVacaciones > new Date(periodoSiguiente.FechaFin)) {
      throw serviceError(
        "Las vacaciones abarcan más de dos períodos de planilla.",
        409,
      );
    }

    tramos.push({
      periodo: periodoSiguiente,
      fechaInicio: inicioSiguienteTramo,
      fechaFin: fechaFinVacaciones,
      dias: diasSiguientePeriodo,
    });
  }

  // PROGRAMADO permite guardar el reconocimiento de vacaciones futuras.
  for (const tramo of tramos) {
    if (!["PROGRAMADO", "ABIERTO", "EN_REVISION"].includes(tramo.periodo.Estado)) {
      throw serviceError(
        `El período ${tramo.periodo.PeriodoId} no permite registrar cálculos de vacaciones.`,
        409,
      );
    }
  }

  const minutosPorDia = 8 * 60;
  const calculosCreados = [];

  for (const tramo of tramos) {
    const calculo = await calculoVacacionesRepository.createCalculo(
      {
        solicitudId,
        periodoId: tramo.periodo.PeriodoId,
        fechaInicioReconocida: tramo.fechaInicio,
        fechaFinReconocida: tramo.fechaFin,
        diasReconocidos: tramo.dias,
        minutosReconocidos: tramo.dias * minutosPorDia,
      },
      transaction,
    );

    if (!calculo) {
      throw serviceError("No se pudo registrar el cálculo de vacaciones.", 500);
    }

    calculosCreados.push(calculo);
  }

  return calculosCreados;
}