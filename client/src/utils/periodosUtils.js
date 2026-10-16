import { formatDate } from "./fechaUtils.js";

export const estadoLabels = {
  PROGRAMADO: "Programado",
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function filtrarPeriodos(
  periodos,
  { desde = "", hasta = "", estado = "", anio = "", busqueda = "" } = {},
) {
  const texto = normalizar(busqueda.trim());
  return periodos.filter((periodo) => {
    const inicio = String(periodo.FechaInicio).slice(0, 10);
    const fin = String(periodo.FechaFin).slice(0, 10);
    // Intersección inclusiva: también encuentra períodos que empiezan antes del rango.
    if (desde && fin < desde) return false;
    if (hasta && inicio > hasta) return false;
    if (estado && periodo.Estado !== estado) return false;
    if (anio && !inicio.startsWith(anio)) return false;
    return [
      periodo.PeriodoId,
      periodo.Estado,
      estadoLabels[periodo.Estado],
      periodo.FechaInicio,
      periodo.FechaFin,
      periodo.FechaLimiteAjustes,
      periodo.FechaPago,
      formatDate(periodo.FechaInicio),
      formatDate(periodo.FechaFin),
      formatDate(periodo.FechaLimiteAjustes),
      formatDate(periodo.FechaPago),
    ].some((valor) => normalizar(valor).includes(texto));
  });
}
