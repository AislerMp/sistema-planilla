import { useRef, useState } from "react";
import { CalendarDays, ShieldCheck } from "lucide-react";
import Dialog from "../../../components/dialog.jsx";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import { registrarPagoPlanilla } from "../../../services/planillas.Service.js";
import { formatDate } from "../../../utils/fechaUtils.js";

export default function ConfirmarPagoModal({
  periodo,
  resumen,
  cantidadColaboradores,
  cantidadRestaurantes,
  onCerrar,
  onRegistrado,
}) {
  const [confirmado, setConfirmado] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const operacionEnCurso = useRef(false);
  const formatoMoneda = new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC" });

  function cerrarModal() {
    if (!operacionEnCurso.current) onCerrar();
  }

  async function confirmarPago(event) {
    event.preventDefault();
    if (!confirmado || operacionEnCurso.current) return;

    // El ref evita dos envíos incluso antes de que React deshabilite el botón.
    operacionEnCurso.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await registrarPagoPlanilla(periodo.PeriodoId);
    } catch (requestError) {
      setError(requestError.message || "No se pudo registrar el pago de la planilla.");
      return;
    } finally {
      operacionEnCurso.current = false;
      setIsSaving(false);
    }
    onRegistrado();
  }

  return (
    <Dialog
      titulo="Confirmar pago de planilla"
      subtitulo="REVISIÓN FINAL"
      className="planilla-confirmacion"
      ocupado={isSaving}
      onCerrar={cerrarModal}
    >
      <div className="planilla-confirmacion-periodo">
        <span className="planilla-icono"><CalendarDays size={21} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">PERÍODO P-{String(periodo.PeriodoId).padStart(4, "0")}</p>
          <p><strong>{formatDate(periodo.FechaInicio)} – {formatDate(periodo.FechaFin)}</strong></p>
        </div>
        <span className="subtle-tag period-status period-status--cerrado">Cerrado</span>
      </div>

      <section className="planilla-confirmacion-total" aria-label="Importes por registrar">
        <p className="eyebrow">NETO POR REGISTRAR</p>
        <strong>{formatoMoneda.format(resumen.totalNeto)}</strong>
        <dl className="planilla-confirmacion-desglose">
          <div><dt>Ingresos</dt><dd>{formatoMoneda.format(resumen.totalIngresos)}</dd></div>
          <div><dt>Deducciones</dt><dd>{formatoMoneda.format(resumen.totalDeducciones)}</dd></div>
        </dl>
      </section>

      <dl className="planilla-confirmacion-alcance">
        <div><dt>Colaboradores incluidos</dt><dd>{cantidadColaboradores}</dd></div>
        <div><dt>Restaurantes incluidos</dt><dd>{cantidadRestaurantes} · Todos</dd></div>
      </dl>
      <AlertMessage title="No se pudo registrar el pago">{error}</AlertMessage>
      {isSaving && <LoadingState mensaje="Registrando el pago de la planilla..." compacto />}
      <form onSubmit={confirmarPago} aria-busy={isSaving}>
        <label className="planilla-confirmacion-check">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(event) => setConfirmado(event.target.checked)}
            disabled={isSaving}
            required
          />
          <span>
            <strong>Revisé el período y los importes.</strong>
            <small>Confirmo el registro del pago para todos los restaurantes.</small>
          </span>
        </label>
        <p className="planilla-nota">
          Al confirmar, se guardarán los detalles y conceptos y el período quedará pagado.
        </p>
        <div className="solicitud-create-actions planilla-confirmacion-acciones">
          <button
            type="button"
            className="button button-secondary"
            onClick={cerrarModal}
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={!confirmado || isSaving}>
            <ShieldCheck size={17} aria-hidden="true" /> {isSaving ? "Registrando..." : "Confirmar pago"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
