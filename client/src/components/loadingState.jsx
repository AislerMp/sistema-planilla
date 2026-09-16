import { LucideLoader } from "lucide-react";

// Solo muestra la espera; cada página controla cuándo se está cargando.
export default function LoadingState({
  entidad = "datos",
  mensaje,
  descripcion = "Un momento, estamos preparando la información.",
  compacto = false,
}) {
  return (
    <div
      className={`loading-state${compacto ? " loading-state--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="loading-state-icon" aria-hidden="true">
        <LucideLoader className="loading-state-spinner" size={28} strokeWidth={1.8} />
      </span>
      <div className="loading-state-copy">
        <p className="loading-state-title">{mensaje || `Cargando ${entidad}...`}</p>
        {descripcion && <p className="loading-state-description">{descripcion}</p>}
      </div>
    </div>
  );
}
