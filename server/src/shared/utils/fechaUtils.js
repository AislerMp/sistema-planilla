// Obtiene el día y la hora actuales de Costa Rica.
export function obtenerCalendarioActual() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const anio = partes.find((parte) => parte.type === "year").value;
  const mes = partes.find((parte) => parte.type === "month").value;
  const dia = partes.find((parte) => parte.type === "day").value;
  const hora = Number(
    partes.find((parte) => parte.type === "hour").value,
  );

  const fechaHoy = `${anio}-${mes}-${dia}`;

  // Inicialmente, la fecha asignada es el día de hoy.
  let fechaAsignada = fechaHoy;

  // Antes de las 4 a. m., las marcas pertenecen al día anterior.
  if (hora < 4) {
    const diaAnterior = new Date(`${fechaHoy}T00:00:00Z`);

    diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);

    fechaAsignada = diaAnterior.toISOString().slice(0, 10);
  }

  return {
    fechaHoy,
    fechaAsignada,
  };
}

// Convierte un SQL DATE recibido como Date a YYYY-MM-DD.
// Requiere options.useUTC: true en la conexión.
export function fechaSQLComoTexto(fecha) {
  return fecha.toISOString().slice(0, 10);
}