const estados = {
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

const formatoFecha = new Intl.DateTimeFormat("es-CR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// Las fechas de planilla son de calendario: UTC evita moverlas al día anterior.
function fechaCalendario(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
}

export default function ResumenPeriodo({ periodo, restaurante }) {
  if (!periodo) return null;

  return (
    <section className="data-panel resumen-periodo" aria-label="Información del período seleccionado">
      <div className="resumen-periodo-encabezado">
        <div>
          <p>Período de planilla</p>
          <h2>
            {formatoFecha.formatRange(
              fechaCalendario(periodo.FechaInicio),
              fechaCalendario(periodo.FechaFin),
            )}
          </h2>
        </div>
        <span
          className={`status-badge period-status period-status--${periodo.Estado?.toLowerCase()}`}
          aria-label={`Estado del período: ${estados[periodo.Estado] ?? periodo.Estado ?? "Sin estado"}`}
        >
          {estados[periodo.Estado] ?? periodo.Estado ?? "Sin estado"}
        </span>
      </div>
      <dl>
        <div>
          <dt>Restaurante</dt>
          <dd>{restaurante || "Sin información"}</dd>
        </div>
        <div>
          <dt>Ajustes hasta</dt>
          <dd>
            {periodo.FechaLimiteAjustes
              ? formatoFecha.format(fechaCalendario(periodo.FechaLimiteAjustes))
              : "Sin fecha definida"}
          </dd>
        </div>
        <div>
          <dt>Fecha de pago</dt>
          <dd>
            {periodo.FechaPago
              ? formatoFecha.format(fechaCalendario(periodo.FechaPago))
              : "Sin fecha definida"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
