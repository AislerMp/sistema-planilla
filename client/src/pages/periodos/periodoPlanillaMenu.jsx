import { useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Clock3,
  FilePlus2,
  LockKeyhole,
} from "lucide-react";
import LoadingState from "../../components/loadingState.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getPeriodos, updateEstadoPeriodo } from "../../services/periodos.Service.js";
import { notifySuccess } from "../../utils/notifications.js";

const estadoLabels = {
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

const transiciones = [
  {
    estadoActual: "ABIERTO",
    estadoNuevo: "EN_REVISION",
    titulo: "Enviar a revisión",
    descripcion: "Finaliza la captura de marcas e inicia la revisión del periodo.",
    icon: Clock3,
  },
  {
    estadoActual: "EN_REVISION",
    estadoNuevo: "CERRADO",
    titulo: "Cerrar periodo",
    descripcion: "Cierra el periodo cuando termine el plazo de ajustes.",
    icon: LockKeyhole,
  },
  {
    estadoActual: "CERRADO",
    estadoNuevo: "PAGADO",
    titulo: "Marcar como pagado",
    descripcion: "Registra el pago una vez alcanzada la fecha establecida.",
    icon: CheckCheck,
  },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export default function PeriodosPlanillaMenu() {
  const { user } = useAuth();

  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const canManage = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(user?.Rol);
  const { data, isLoading, error } = useAsyncRequest(
    () => canManage ? getPeriodos() : Promise.resolve([]),
    [reloadKey, canManage],
  );
  const periodos = data ?? [];

  const periodoActual =
    [...periodos]
      .filter((periodo) => periodo.Estado !== "PAGADO")
      .sort((a, b) => String(a.FechaInicio).localeCompare(String(b.FechaInicio)))[0] ??
    periodos[0] ??
    null;

  async function changeStatus(action) {
    if (!canManage || !periodoActual || busy || isLoading || error) return;

    const confirmation = await Swal.fire({
      icon: "warning",
      titleText: `${action.titulo}?`,
      text: `El periodo #${periodoActual.PeriodoId} cambiará de ${estadoLabels[action.estadoActual]} a ${estadoLabels[action.estadoNuevo]}.`,
      showCancelButton: true,
      confirmButtonText: "Confirmar cambio",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      focusCancel: true,
      background: "var(--color-surface)",
      color: "var(--color-text)",
      confirmButtonColor: "var(--color-primary)",
    });

    if (!confirmation.isConfirmed) return;

    setBusy(true);
    setActionError("");
    try {
      await updateEstadoPeriodo(periodoActual.PeriodoId, {
        estado: action.estadoNuevo,
      });
      notifySuccess(`Periodo actualizado: ${estadoLabels[action.estadoNuevo]}.`);
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> / <span>Periodos de planilla</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Periodos de planilla</h1>
          <p>Consulta los ciclos de pago y gestiona sus etapas.</p>
        </div>
      </div>

      {!canManage && (
        <AlertMessage title="Acceso restringido">
          Solo Recursos Humanos y Administración pueden gestionar los periodos de planilla.
        </AlertMessage>
      )}

      {actionError && (
        <AlertMessage title="No se pudo actualizar el periodo">
          {actionError}
        </AlertMessage>
      )}

      <section className="period-current data-panel" aria-labelledby="period-current-title">
        <div className="period-current-heading">
          <div className="period-section-title">
            <CalendarDays size={19} aria-hidden="true" />
            <h2 id="period-current-title">
              {periodoActual?.Estado === "PAGADO" ? "Último periodo" : "Periodo en gestión"}
            </h2>
          </div>
          {periodoActual && (
            <span className={`status-badge period-status period-status--${periodoActual.Estado.toLowerCase()}`}>
              {estadoLabels[periodoActual.Estado] ?? periodoActual.Estado}
            </span>
          )}
        </div>
        
        {isLoading ? (
          <LoadingState entidad="periodo en gestión" compacto descripcion="" />
        ) : error ? (
          <div className="period-empty">
            <p>No se pudo cargar el periodo en gestión.</p>
            <p className="muted">{error}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : !periodoActual ? (
          <div className="period-empty">
            <p>No hay periodos registrados todavía.</p>
            {canManage && (
              <Link className="button button-primary" to="/periodos/crear">
                <FilePlus2 size={17} /> Crear periodo
              </Link>
            )}
          </div>
        ) : (
          <div className="period-current-content">
            <div className="period-current-number">
              <span>{periodoActual.Estado === "PAGADO" ? "FINALIZADO" : "EN GESTIÓN"}</span>
              <strong>#{periodoActual.PeriodoId}</strong>
              <small>
                {formatDate(periodoActual.FechaInicio)} – {formatDate(periodoActual.FechaFin)}
              </small>
            </div>
            <dl className="period-dates">
              <div>
                <dt>Límite de ajustes</dt>
                <dd>{formatDate(periodoActual.FechaLimiteAjustes)}</dd>
              </div>
              <div>
                <dt>Fecha de pago</dt>
                <dd>{formatDate(periodoActual.FechaPago)}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <section className="period-section" aria-labelledby="period-consult-title">
        <div className="period-section-heading">
          <div>
            <p className="eyebrow accent">CONSULTA Y REGISTRO</p>
            <h2 id="period-consult-title">Accesos</h2>
          </div>
        </div>
        <div className="period-option-grid">
          <Link className="period-option" to="/periodos/listado">
            <span className="period-option-icon"><ClipboardList size={21} /></span>
            <span className="period-option-copy">
              <strong>Mostrar periodos</strong>
              <small>Consulta y busca periodos por fecha o estado.</small>
            </span>
            <ArrowRight className="period-option-arrow" size={18} />
          </Link>
          {canManage && (
            <Link className="period-option" to="/periodos/crear">
              <span className="period-option-icon"><FilePlus2 size={21} /></span>
              <span className="period-option-copy">
                <strong>Crear periodo</strong>
                <small>Define las fechas del siguiente ciclo de planilla.</small>
              </span>
              <ArrowRight className="period-option-arrow" size={18} />
            </Link>
          )}
        </div>
      </section>

      <section className="period-section" aria-labelledby="period-workflow-title">
        <div className="period-section-heading">
          <div>
            <p className="eyebrow accent">FLUJO DEL PERIODO</p>
            <h2 id="period-workflow-title">Actualización de estado</h2>
          </div>
          <p>Los cambios se confirman antes de aplicarse.</p>
        </div>
        <div className="period-workflow">
          {transiciones.map((action, index) => {

            const Icon = action.icon;
            const isAvailable =
              canManage &&
              !isLoading &&
              !error &&
              periodoActual?.Estado === action.estadoActual;

            return (
              <article className="period-workflow-step" key={action.estadoNuevo}>
                <div className="period-step-number">0{index + 1}</div>
                <div className="period-step-copy">
                  <span>{estadoLabels[action.estadoActual]} <ArrowRight size={13} /> {estadoLabels[action.estadoNuevo]}</span>
                  <h3>{action.titulo}</h3>
                  <p>{action.descripcion}</p>
                </div>

                <button
                  type="button"
                  className={`button ${isAvailable ? "button-primary" : "button-secondary"}`}
                  disabled={!isAvailable || busy}
                  onClick={() => changeStatus(action)}
                >
                  <Icon size={17} />
                  {busy && isAvailable ? "Actualizando..." : "Actualizar"}
                </button>
              </article>
            );
          })}

        </div>
      </section>
    </>
  );
}
