export function obtenerDiasDelRango(desde, hasta) {
  const dias = [];

  const fecha = new Date(`${desde}T00:00:00Z`);
  const fechaFinal = new Date(`${hasta}T00:00:00Z`);

  while (fecha <= fechaFinal) {
    dias.push(fecha.toISOString().slice(0, 10));
    fecha.setUTCDate(fecha.getUTCDate() + 1);
  }

  return dias;
}

export function formatDate(value) {
  const dateFormat = new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return dateFormat.format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

export const fechaHoraFormat = new Intl.DateTimeFormat("es-CR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  });

export function obtenerSemanas(periodo) {
  if (!periodo) return [];

  const inicio = String(periodo.FechaInicio).slice(0, 10);
  const fin = String(periodo.FechaFin).slice(0, 10);

  const fecha = new Date(`${inicio}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 6);

  const finPrimeraSemana = fecha.toISOString().slice(0, 10);

  if (finPrimeraSemana >= fin) {
    return [{ desde: inicio, hasta: fin }];
  }

  fecha.setUTCDate(fecha.getUTCDate() + 1);

  return [
    // La más reciente primero.
    { desde: fecha.toISOString().slice(0, 10), hasta: fin },
    { desde: inicio, hasta: finPrimeraSemana },
  ];
}

export function etiquetaSemana({ desde, hasta }) {
  const formato = new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return formato.formatRange(
    new Date(`${desde}T00:00:00Z`),
    new Date(`${hasta}T00:00:00Z`),
  );
}