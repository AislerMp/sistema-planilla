import { obtenerCalendarioActual, fechaSQLComoTexto } from "./fechaUtils.js";
import { serviceError, validateDate } from "./serviceUtils.js";

export const LIMITES_ORDINARIOS_MINUTOS = {
  DIURNA: 480,
  MIXTA: 420,
  NOCTURNA: 360,
};

// Compatibilidad con asistencias históricas sin clasificación. No las etiqueta.
const LIMITE_SIN_CLASIFICAR = 480;

export function obtenerLimiteOrdinarioMinutos(tipoJornada) {
  if (tipoJornada == null) return LIMITE_SIN_CLASIFICAR;

  const limite = LIMITES_ORDINARIOS_MINUTOS[tipoJornada];
  if (!Object.hasOwn(LIMITES_ORDINARIOS_MINUTOS, tipoJornada)) {
    throw serviceError("El tipo de jornada no es válido.", 500);
  }
  return limite;
}

export function clasificarJornada(intervalos = []) {
  let tiempoTotal = 0;
  let tiempoDiurno = 0;

  for (const intervalo of intervalos) {
    // Las marcas vienen como Date en UTC (SQL Server: useUTC = true).
    const entrada = intervalo.FechaHoraEntrada;
    const salida = intervalo.FechaHoraSalida;
    if (salida == null) continue;

    if (
      !(entrada instanceof Date) || !(salida instanceof Date) ||
      Number.isNaN(entrada.getTime()) || Number.isNaN(salida.getTime()) ||
      salida < entrada
    ) {
      throw serviceError("Las fechas de las marcas no son válidas.", 500);
    }

    tiempoTotal += salida - entrada;
    // Se usa el día calendario de Costa Rica, no el corte de marcas a las 4 a. m.
    const { fechaHoy } = obtenerCalendarioActual(entrada);
    const dia = validateDate(fechaHoy, "Fecha de marca");

    while (true) {
      const fecha = fechaSQLComoTexto(dia);
      // Costa Rica utiliza UTC-6. Cada ventana diurna va de 05:00 a 19:00.
      const inicioDiurno = new Date(`${fecha}T05:00:00-06:00`);
      const finDiurno = new Date(`${fecha}T19:00:00-06:00`);
      if (inicioDiurno >= salida) break;

      tiempoDiurno += Math.max(
        0,
        Math.min(salida.getTime(), finDiurno.getTime()) -
          Math.max(entrada.getTime(), inicioDiurno.getTime()),
      );
      dia.setUTCDate(dia.getUTCDate() + 1);
    }
  }

  if (tiempoTotal === 0) {
    return { tipoJornada: null, limiteOrdinarioMinutos: null };
  }

  const tiempoNocturno = tiempoTotal - tiempoDiurno;
  let tipoJornada;
  if (tiempoNocturno === 0) {
    tipoJornada = "DIURNA";                     // 3 horas y media
  } else if (tiempoDiurno === 0 || tiempoNocturno >= 210 * 60_000) {
    tipoJornada = "NOCTURNA";
  } else {
    tipoJornada = "MIXTA";
  }

  return {
    tipoJornada,
    limiteOrdinarioMinutos: obtenerLimiteOrdinarioMinutos(tipoJornada),
  };
}
