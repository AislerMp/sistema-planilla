import { obtenerFechaHoyCostaRica } from "./fechaUtils.js";

// Rango visible incluso cuando la API no devuelve ninguna asistencia.
export function obtenerRangoAsistencias(filtros = {}, periodo, asistencias = [], instante = new Date()) {
  if (filtros.hasta && !filtros.desde) {
    return { desde: filtros.hasta, hasta: filtros.hasta };
  }
  if (filtros.periodoId && periodo) {
    return {
      desde: filtros.desde || periodo.FechaInicio.slice(0, 10),
      hasta: filtros.hasta || periodo.FechaFin.slice(0, 10),
    };
  }
  if (filtros.desde && filtros.hasta) {
    return { desde: filtros.desde, hasta: filtros.hasta };
  }

  // Mismo calendario y corte de las 4 a. m. que la consulta semanal del backend.
  const hasta = new Date(`${obtenerFechaHoyCostaRica(instante)}T00:00:00Z`);
  const hora = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica", hour: "2-digit", hourCycle: "h23",
  }).format(instante));
  if (hora < 4) hasta.setUTCDate(hasta.getUTCDate() - 1);

  if (filtros.desde) {
    const fechas = asistencias.map((a) => a.FechaAsignada.slice(0, 10)).sort();
    const fin = fechas.at(-1) || hasta.toISOString().slice(0, 10);
    return { desde: filtros.desde, hasta: fin < filtros.desde ? filtros.desde : fin };
  }

  const desde = new Date(hasta);
  const diaSemana = desde.getUTCDay();
  desde.setUTCDate(desde.getUTCDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) };
}

export function distribuirMinutos(totalMinutos, limiteOrdinarioMinutos) {
  if (
    !Number.isInteger(totalMinutos) || totalMinutos < 0 ||
    !Number.isInteger(limiteOrdinarioMinutos) || limiteOrdinarioMinutos <= 0
  ) {
    return null;
  }

  return {
    minutosOrdinarios: Math.min(totalMinutos, limiteOrdinarioMinutos),
    minutosExtras: Math.max(0, totalMinutos - limiteOrdinarioMinutos),
  };
}

export function mostrarDuracion(minutos) {
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export function puedeAjustarAsistencia(asistencia, fechaHoy) {
  return ["ABIERTO", "EN_REVISION"].includes(asistencia.EstadoPeriodo) &&
    Boolean(asistencia.FechaLimiteAjustes) &&
    fechaHoy <= asistencia.FechaLimiteAjustes.slice(0, 10);
}
