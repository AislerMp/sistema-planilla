import { useRef, useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import { CalendarDays, RefreshCw } from "lucide-react";
import LoadingState from "../../components/loadingState.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getPeriodos, getPeriodoActual, updateEstadoPeriodo } from "../../services/periodos.Service.js";
import { notifySuccess } from "../../utils/notifications.js";
import { estadoLabels } from "../../utils/periodosUtils.js";
import { formatDate } from "../../utils/fechaUtils.js";
import PeriodosPlanillaList from "./periodosPlanillaList.jsx";

export default function PeriodosPlanillaMenu() {
  const { user } = useAuth();
  const canManage = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(user?.Rol);
  const [reloadKey, setReloadKey] = useState(0);
  const [pagandoId, setPagandoId] = useState(null);
  const [actionError, setActionError] = useState("");
  const pagoEnCurso = useRef(false);

  const { data: periodos, isLoading, error } = useAsyncRequest(
    () => canManage ? getPeriodos() : Promise.resolve([]),
    [reloadKey, canManage],
  );
  const { data: periodoActual, isLoading: cargandoActual, error: errorActual } = useAsyncRequest(
    () => canManage ? getPeriodoActual() : Promise.resolve(null),
    [reloadKey, canManage],
  );
  const estados = Object.keys(estadoLabels);
  const etapaActual = !cargandoActual && !errorActual ? estados.indexOf(periodoActual?.Estado) : -1;

  function actualizar() {
    setReloadKey((anterior) => anterior + 1);
  }

  async function confirmarPago(periodo) {
    if (!canManage || periodo.Estado !== "CERRADO" || pagoEnCurso.current || isLoading || error) return;
    pagoEnCurso.current = true;
    setPagandoId(periodo.PeriodoId);
    setActionError("");
    try {
      const confirmation = await Swal.fire({
        icon: "warning",
        titleText: "¿Confirmar pago?",
        text: `Período del ${formatDate(periodo.FechaInicio)} al ${formatDate(periodo.FechaFin)}. Fecha de pago: ${formatDate(periodo.FechaPago)}. Confirmá que el pago fue realizado; el período quedará Pagado.`,
        showCancelButton: true,
        confirmButtonText: "Confirmar pago",
        cancelButtonText: "Cancelar",
        reverseButtons: true,
        focusCancel: true,
        background: "var(--color-surface)",
        color: "var(--color-text)",
        confirmButtonColor: "var(--color-primary)",
      });
      if (!confirmation.isConfirmed) return;

      // El servidor valida el rol, el estado y la fecha de pago definitiva.
      await updateEstadoPeriodo(periodo.PeriodoId, { estado: "PAGADO" });
      notifySuccess("Pago del período confirmado.");
      actualizar();
    } catch (requestError) {
      setActionError(`Período del ${formatDate(periodo.FechaInicio)} al ${formatDate(periodo.FechaFin)}: ${requestError.message}`);
    } finally {
      pagoEnCurso.current = false;
      setPagandoId(null);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> / <span>Períodos de planilla</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">CALENDARIO DE PLANILLA</p>
          <h1>Períodos de planilla</h1>
          <p>Consultá el avance de cada período y confirmá los pagos realizados.</p>
        </div>
        {canManage && (
          <button className="button button-secondary" type="button" onClick={actualizar} disabled={isLoading || cargandoActual || pagandoId !== null}>
            <RefreshCw size={17} aria-hidden="true" /> {isLoading || cargandoActual ? "Actualizando…" : "Actualizar"}
          </button>
        )}
      </div>

      {!canManage ? (
        <AlertMessage title="Acceso restringido">
          Solo Recursos Humanos y Administración pueden gestionar los períodos de planilla.
        </AlertMessage>
      ) : (
        <>
          <section className="period-current data-panel" aria-labelledby="period-current-title">
            <div className="period-current-heading">
              <div className="period-section-title">
                <CalendarDays size={20} aria-hidden="true" />
                <h2 id="period-current-title">Período actual de asistencia</h2>
              </div>
              {!cargandoActual && !errorActual && periodoActual && (
                <span className={`status-badge period-status period-status--${periodoActual.Estado.toLowerCase()}`}>
                  {estadoLabels[periodoActual.Estado] ?? periodoActual.Estado}
                </span>
              )}
            </div>
            {cargandoActual ? (
              <LoadingState entidad="período actual" compacto descripcion="" />
            ) : errorActual ? (
              <AlertMessage title="No se pudo consultar el período actual">{errorActual}</AlertMessage>
            ) : !periodoActual ? (
              <p className="period-empty">No existe un período en el calendario para la fecha de asistencia actual.</p>
            ) : (
              <dl className="period-dates">
                <div><dt>Inicio</dt><dd>{formatDate(periodoActual.FechaInicio)}</dd></div>
                <div><dt>Fin</dt><dd>{formatDate(periodoActual.FechaFin)}</dd></div>
                <div><dt>Límite de ajustes</dt><dd>{formatDate(periodoActual.FechaLimiteAjustes)}</dd></div>
                <div><dt>Fecha de pago</dt><dd>{formatDate(periodoActual.FechaPago)}</dd></div>
              </dl>
            )}
            <p className="period-note">Antes de las 4 a. m. de Costa Rica, la asistencia corresponde al día anterior.</p>
            <ol className="period-progress" aria-label="Avance del período actual">
              {estados.map((estado, indice) => (
                <li key={estado} aria-current={indice === etapaActual ? "step" : undefined} data-completado={indice < etapaActual}>
                  <span className="period-progress-number" aria-hidden="true">{indice + 1}</span>
                  <span>{estadoLabels[estado]}</span>
                </li>
              ))}
            </ol>
            <p className="period-note">La apertura, revisión y cierre son automáticos. Pagado requiere confirmar el pago, aunque su fecha ya haya llegado.</p>
          </section>

          <AlertMessage title="No se pudo confirmar el pago" onClose={() => setActionError("")}>{actionError}</AlertMessage>
          <PeriodosPlanillaList
            periodos={periodos ?? []}
            isLoading={isLoading}
            error={error}
            pagandoId={pagandoId}
            onConfirmarPago={confirmarPago}
          />
        </>
      )}
    </>
  );
}
