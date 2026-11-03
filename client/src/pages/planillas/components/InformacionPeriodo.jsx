import { CalendarDays, Clock3 } from "lucide-react";
import { formatDate } from "../../../utils/fechaUtils.js";

const estados = {
  PROGRAMADO: "Programado",
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

export default function InformacionPeriodo({ periodo, descripcion }) {
  if (!periodo) {
    return (
      <section className="data-panel planilla-periodo" aria-label="Información del período">
        <p className="planilla-nota">Seleccioná un período para consultar su información.</p>
      </section>
    );
  }

  return (
    <section className="data-panel planilla-periodo" aria-label="Información del período">
      <div className="planilla-periodo-encabezado">
        <div className="planilla-periodo-nombre">
          <span className="planilla-icono"><CalendarDays size={21} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">P-{String(periodo.PeriodoId).padStart(4, "0")}</p>
            <h2>{formatDate(periodo.FechaInicio)} – {formatDate(periodo.FechaFin)}</h2>
          </div>
        </div>
        <span className={`subtle-tag period-status period-status--${periodo.Estado.toLowerCase()}`}>
          {estados[periodo.Estado] ?? periodo.Estado}
        </span>
      </div>
      {descripcion && <p className="planilla-nota">{descripcion}</p>}
      <div className="planilla-periodo-fechas">
        <span><Clock3 size={15} aria-hidden="true" /> Ajustes hasta el <strong>{periodo.FechaLimiteAjustes ? formatDate(periodo.FechaLimiteAjustes) : "Sin definir"}</strong></span>
        <span>Fecha de pago: <strong>{periodo.FechaPago ? formatDate(periodo.FechaPago) : "Sin definir"}</strong></span>
      </div>
    </section>
  );
}
