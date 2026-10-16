import { obtenerFechaHoyCostaRica } from "./fechaUtils.js";

export function puedeRevertirSolicitudFutura(
  solicitud,
  rol,
  fechaHoy = obtenerFechaHoyCostaRica(),
) {
  return (
    rol === "GERENTE" &&
    ["APROBADA", "RECHAZADA"].includes(solicitud?.Estado) &&
    String(solicitud?.FechaSolicitada ?? "").slice(0, 10) > fechaHoy
  );
}

export function obtenerEstadoReversionIncapacidad(incapacidad, rol) {
  if (!incapacidad || incapacidad.RevisadoPorGerenteId == null) return null;
  if (
    rol === "GERENTE" &&
    incapacidad.RevisadoPorRhId == null &&
    ["EN_REVISION_RH", "RECHAZADA"].includes(incapacidad.Estado)
  ) {
    return "PENDIENTE";
  }
  if (
    rol === "RECURSOS_HUMANOS" &&
    incapacidad.RevisadoPorRhId != null &&
    incapacidad.Estado === "RECHAZADA"
  ) {
    return "EN_REVISION_RH";
  }
  return null;
}

export function validarMotivoReversion(valor) {
  const motivo = String(valor ?? "").trim();
  if (!motivo) return "Ingresá el motivo de la reversión.";
  if (motivo.length > 500)
    return "El motivo no puede superar los 500 caracteres.";
  return null;
}
