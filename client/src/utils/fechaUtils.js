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