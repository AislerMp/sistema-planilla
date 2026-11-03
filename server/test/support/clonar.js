// Conserva Date dentro del entorno de Jest al copiar el estado de los dobles SQL.
// structuredClone de Node devuelve fechas de otro contexto VM.
export function clonar(valor) {
  if (valor instanceof Date) return new Date(valor.getTime());
  if (Array.isArray(valor)) return valor.map(clonar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([clave, dato]) => [clave, clonar(dato)]));
  }
  return valor;
}
