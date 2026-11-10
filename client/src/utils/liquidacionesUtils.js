import { obtenerFechaHoyCostaRica } from "./fechaUtils.js";

function mostrarAntiguedad(fechaIngreso, fechaReferencia) {
  const ingreso = new Date(`${String(fechaIngreso).slice(0, 10)}T00:00:00Z`);
  const referencia = new Date(`${fechaReferencia}T00:00:00Z`);
  if (
    Number.isNaN(ingreso.getTime()) ||
    Number.isNaN(referencia.getTime()) ||
    ingreso > referencia
  )
    return "—";

  let meses =
    (referencia.getUTCFullYear() - ingreso.getUTCFullYear()) * 12 +
    referencia.getUTCMonth() -
    ingreso.getUTCMonth();
  if (referencia.getUTCDate() < ingreso.getUTCDate()) meses -= 1;
  if (meses <= 0) return "Menos de un mes";

  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  return [
    anios > 0 ? `${anios} ${anios === 1 ? "año" : "años"}` : null,
    mesesRestantes > 0
      ? `${mesesRestantes} ${mesesRestantes === 1 ? "mes" : "meses"}`
      : null,
  ]
    .filter(Boolean)
    .join(" y ");
}

// La API usa PascalCase; la interfaz conserva un único formato de presentación.
export function adaptarColaboradorLiquidacion(
  colaborador,
  fechaReferencia = obtenerFechaHoyCostaRica(),
) {
  return {
    id: colaborador.ColaboradorId,
    nombres: colaborador.Nombres ?? "",
    apellidos: [colaborador.Apellido1, colaborador.Apellido2].filter(Boolean).join(" "),
    identificacion: String(colaborador.Identificacion ?? ""),
    restauranteId: colaborador.RestauranteId,
    restaurante: colaborador.NombreRestaurante ?? "—",
    puesto: colaborador.NombrePuesto ?? "—",
    fechaIngreso: colaborador.FechaIngreso,
    antiguedad: mostrarAntiguedad(colaborador.FechaIngreso, fechaReferencia),
    tarifaHora:
      colaborador.TarifaHora == null ? null : Number(colaborador.TarifaHora),
    activo: colaborador.Activo === true || colaborador.Activo === 1,
    vacacionesDisponibles: null,
  };
}

export const motivosSalida = [{
  codigo: "DESPIDO_CON_RESPONSABILIDAD",
  nombre: "Despido con responsabilidad",
  descripcion: "Incluye una muestra de las cuatro prestaciones."
}, {
  codigo: "RENUNCIA",
  nombre: "Renuncia",
  descripcion: "Muestra vacaciones y aguinaldo proporcional."
}, {
  codigo: "DESPIDO_SIN_RESPONSABILIDAD",
  nombre: "Despido sin responsabilidad",
  descripcion: "Muestra los importes de vacaciones y aguinaldo."
}];

const importe = (valor) => valor == null ? null : Number(valor);

// Se presentan los importes guardados; no se vuelve a calcular la liquidación.
export function adaptarLiquidacionHistorica(liquidacion) {
  return {
    id: liquidacion.LiquidacionId,
    colaboradorId: liquidacion.ColaboradorId,
    nombres: liquidacion.ColaboradorNombre ?? "",
    apellidos: [liquidacion.ColaboradorApellido1, liquidacion.ColaboradorApellido2].filter(Boolean).join(" "),
    identificacion: String(liquidacion.Identificacion ?? ""),
    restauranteId: liquidacion.RestauranteId,
    restaurante: liquidacion.RestauranteNombre ?? "—",
    fechaIngreso: liquidacion.FechaIngreso,
    fechaSalida: String(liquidacion.FechaSalida).slice(0, 10),
    motivoSalida: liquidacion.MotivoSalida,
    registradoPor: liquidacion.RegistradoPorNombre
      ?? (liquidacion.RegistradoPorUsuarioId == null ? "—" : `Usuario #${liquidacion.RegistradoPorUsuarioId}`),
    observacion: liquidacion.Observacion ?? "",
    detallePlanillaId: liquidacion.DetallePlanillaId ?? null,
    desglose: {
      diasVacacionesPagados: importe(liquidacion.DiasVacacionesPagados),
      diasPreavisoPagados: importe(liquidacion.DiasPreavisoPagados),
      diasCesantiaPagados: importe(liquidacion.DiasCesantiaPagados),
      montoVacaciones: importe(liquidacion.MontoVacaciones),
      montoAguinaldo: importe(liquidacion.MontoAguinaldo),
      montoPreaviso: importe(liquidacion.MontoPreaviso),
      montoCesantia: importe(liquidacion.MontoCesantia),
      totalLiquidacion: importe(liquidacion.TotalLiquidacion),
    },
  };
}
