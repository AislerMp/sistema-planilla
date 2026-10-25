import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ClipboardCheck, ReceiptText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { getSolicitudDeduccionById } from "../../../services/deducciones.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import { formatDate } from "../../../utils/fechaUtils.js";

const etiquetasEstado = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const formatoPorcentaje = new Intl.NumberFormat("es-CR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function DetalleSolicitudDeduccion() {
  const { solicitudId } = useParams();
  const { user } = useAuth();
  const esRh = user?.Rol === "RECURSOS_HUMANOS";
  const { data: solicitud, error, isLoading } = useAsyncRequest(
    () => getSolicitudDeduccionById(solicitudId),
    [solicitudId],
  );

  if (isLoading) {
    return <LoadingState entidad="detalle de la deducción" />;
  }

  if (error || !solicitud) {
    return (
      <div className="deduccion-solicitudes-page">
        <Link className="deducciones-volver" to="/solicitudes-deducciones">
          <ArrowLeft size={17} aria-hidden="true" /> Volver a solicitudes
        </Link>
        <AlertMessage title="No se pudo cargar la solicitud">
          {error || "No se encontró la solicitud de deducción."}
        </AlertMessage>
      </div>
    );
  }

  const resuelta = solicitud.Estado !== "PENDIENTE";
  const estadoTexto = etiquetasEstado[solicitud.Estado] ?? solicitud.Estado;
  const colaborador =
    [solicitud.Nombres, solicitud.Apellidos].filter(Boolean).join(" ") ||
    `Colaborador #${solicitud.ColaboradorId}`;
  const restaurante =
    solicitud.Restaurante || `Restaurante #${solicitud.RestauranteId}`;
  const porcentaje = `${formatoPorcentaje.format(solicitud.PorcentajeSolicitado)} %`;
  const fechaFin = solicitud.FechaFin
    ? formatDate(solicitud.FechaFin)
    : "Sin fecha final";

  return (
    <div className="deduccion-solicitudes-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/solicitudes-deducciones">Solicitudes de deducciones</Link> /{" "}
        <span>Detalle</span>
      </div>

      <Link className="deducciones-volver" to="/solicitudes-deducciones">
        <ArrowLeft size={17} aria-hidden="true" /> Volver a solicitudes
      </Link>

      <div className="page-header deduccion-solicitudes-detail-header">
        <div>
          <p className="eyebrow accent">SOLICITUD #{solicitud.SolicitudId}</p>
          <h1>Detalle de deducción</h1>
          <p>Datos de la solicitud y seguimiento de su revisión.</p>
        </div>
        <span className="solicitud-state" data-estado={solicitud.Estado}>
          {estadoTexto}
        </span>
      </div>

      <section
        className="data-panel deduccion-solicitudes-card deduccion-solicitudes-hero"
        aria-label="Resumen de la solicitud"
      >
        <div className="deduccion-solicitudes-hero-title">
          <span className="deduccion-solicitudes-icon">
            <ReceiptText size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow accent">DEDUCCIÓN {solicitud.TipoDeduccion}</p>
            <h2>{solicitud.NombreDeduccion}</h2>
            <p>{solicitud.Codigo}</p>
          </div>
        </div>
        <dl className="deduccion-solicitudes-summary">
          <div><dt>Porcentaje solicitado</dt><dd>{porcentaje}</dd></div>
          <div><dt>Inicio de aplicación</dt><dd>{formatDate(solicitud.FechaInicio)}</dd></div>
          <div><dt>Fin de aplicación</dt><dd>{fechaFin}</dd></div>
        </dl>
        <ol className="solicitud-etapas deduccion-solicitudes-progress">
          <li><span className="incapacidad-etapa-numero">1</span> Registrada</li>
          <li aria-current={!resuelta ? "step" : undefined}>
            <span className="incapacidad-etapa-numero">2</span> Revisión de RH
          </li>
          <li aria-current={resuelta ? "step" : undefined}>
            <span className="incapacidad-etapa-numero">3</span> Resultado
          </li>
        </ol>
      </section>

      <div className="deduccion-solicitudes-layout deduccion-solicitudes-detail-layout">
        <div className="deduccion-solicitudes-main">
          <section className="data-panel deduccion-solicitudes-card" aria-labelledby="deduccion-detalle-datos">
            <div className="deduccion-solicitudes-card-heading">
              <ClipboardCheck size={20} aria-hidden="true" />
              <h2 id="deduccion-detalle-datos">Datos de la solicitud</h2>
            </div>
            <dl className="solicitud-details">
              <div><dt>Colaborador</dt><dd>{colaborador}</dd></div>
              <div><dt>Restaurante</dt><dd>{restaurante}</dd></div>
              <div><dt>Concepto</dt><dd>{solicitud.NombreDeduccion}</dd></div>
              <div><dt>Porcentaje</dt><dd>{porcentaje}</dd></div>
              <div><dt>Desde</dt><dd>{formatDate(solicitud.FechaInicio)}</dd></div>
              <div><dt>Hasta</dt><dd>{fechaFin}</dd></div>
              {solicitud.EntidadReceptora && (
                <div><dt>Entidad receptora</dt><dd>{solicitud.EntidadReceptora}</dd></div>
              )}
              <div><dt>Autorización</dt><dd>{solicitud.Autorizacion ? "Sí" : "No"}</dd></div>
              <div className="solicitud-details-wide">
                <dt>Motivo</dt><dd>{solicitud.Motivo || "Sin motivo indicado"}</dd>
              </div>
              {solicitud.Observacion && (
                <div className="solicitud-details-wide">
                  <dt>Observación de RH</dt><dd>{solicitud.Observacion}</dd>
                </div>
              )}
            </dl>
          </section>

          {esRh && !resuelta && (
            <section className="data-panel deduccion-solicitudes-card" aria-labelledby="deduccion-revision-titulo">
              <div className="deduccion-solicitudes-card-heading">
                <ClipboardCheck size={20} aria-hidden="true" />
                <div>
                  <h2 id="deduccion-revision-titulo">Resolución de Recursos Humanos</h2>
                  <p>Revisá los datos antes de decidir.</p>
                </div>
              </div>
              <div className="solicitud-create-form">
                <label htmlFor="deduccion-observacion">
                  Observación (opcional)
                  <textarea id="deduccion-observacion" maxLength={500} placeholder="Agregá una observación para el colaborador." />
                </label>
                <div className="solicitud-create-actions">
                  <button className="button button-secondary" type="button" disabled={isLoading} >Rechazar</button>
                  <button className="button button-primary" type="button" disabled={isLoading} >Aprobar deducción</button>
                </div>
                <p className="solicitud-create-note deduccion-solicitudes-demo">
                  Vista de diseño: la resolución todavía no está conectada.
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="deduccion-solicitudes-aside">
          <section className="data-panel deduccion-solicitudes-card" aria-labelledby="deduccion-seguimiento-titulo">
            <div className="deduccion-solicitudes-card-heading">
              <CalendarDays size={20} aria-hidden="true" />
              <h2 id="deduccion-seguimiento-titulo">Seguimiento</h2>
            </div>
            <div className="deduccion-solicitudes-timeline">
              <div>
                <span className="deduccion-solicitudes-timeline-dot" />
                <strong>Solicitud registrada</strong>
                <p>Registrada por el usuario #{solicitud.RegistradoPorUsuarioId}.</p>
              </div>
              <div>
                <span className="deduccion-solicitudes-timeline-dot" />
                <strong>Revisión de RH</strong>
                <p>{resuelta
                  ? `Revisada por el usuario #${solicitud.RevisadoPorRhId}.`
                  : "Pendiente de aprobación o rechazo."}</p>
              </div>
              <div>
                <span className="deduccion-solicitudes-timeline-dot" />
                <strong>Resultado</strong>
                <p>{resuelta ? estadoTexto : "Se mostrará cuando RH resuelva la solicitud."}</p>
              </div>
            </div>
          </section>
          <section className="data-panel deduccion-solicitudes-card deduccion-solicitudes-hint">
            <h2>Estado actual</h2>
            <p>{resuelta
              ? `Recursos Humanos ${solicitud.Estado === "APROBADA" ? "aprobó" : "rechazó"} la solicitud.`
              : "La solicitud está pendiente de revisión de Recursos Humanos."}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
