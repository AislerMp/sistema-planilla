// Etiqueta informativa: no clasifica jornadas ni define límites de horas.
export default function EtiquetaJornada({ tipo = "sin-clasificar", children = "Sin clasificar" }) {
  return <span className={`planilla-jornada planilla-jornada--${tipo}`}>{children}</span>;
}
