import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Download, CalendarDays, ClipboardCheck, Calculator } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";

import {
  getIncapacidadById,
  revisarIncapacidadGerente,
  resolverIncapacidadRh,
  descargarComprobanteIncapacidad,
  getCalculoIncapacidad,
} from "../../services/incapacidades.Services.js";
import { formatDate } from "../../utils/fechaUtils.js";
import { notifySuccess } from "../../utils/notifications.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useState } from "react";

const estadosLabel = {
  PENDIENTE: "Pendiente de revisión de gerencia",
  EN_REVISION_RH: "En revisión de Recursos Humanos",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

function obtenerDias(fechaInicio, fechaFin) {
  const inicio = new Date(`${String(fechaInicio).slice(0, 10)}T00:00:00Z`);
  const fin = new Date(`${String(fechaFin).slice(0, 10)}T00:00:00Z`);
  return (fin.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000) + 1;
}

const emptyForm = {
  observacion: "",
};

export default function DetalleIncapacidad() {
  const { id } = useParams();
  const { user } = useAuth();

  const isGerente = user?.Rol === "GERENTE";
  const isRH = user?.Rol === "RECURSOS_HUMANOS";
  const puedeVerCalculo = isRH || user?.Rol === "ADMINISTRADOR";

  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const {
    data: incapacidad,
    isLoading,
    error,
  } = useAsyncRequest(() => getIncapacidadById(id), [id, reloadKey]);
  const solicitudCalculoId =
    puedeVerCalculo && !isLoading && !error && incapacidad?.Estado === "APROBADA"
      ? incapacidad.SolicitudId
      : null;
  const {
    data: calculo,
    isLoading: isLoadingCalculo,
    error: errorCalculo,
  } = useAsyncRequest(
    () => solicitudCalculoId != null
      ? getCalculoIncapacidad(solicitudCalculoId)
      : Promise.resolve(null),
    [solicitudCalculoId, reloadKey],
  );

  const diasIncapacidad = incapacidad
    ? obtenerDias(incapacidad.FechaInicio, incapacidad.FechaFin)
    : null;

  const etapaActual =
    {
      PENDIENTE: 1,
      EN_REVISION_RH: 2,
      APROBADA: 3,
      RECHAZADA: 3,
    }[incapacidad?.Estado] ?? 0;

  async function handleSubmit(e) {
    e.preventDefault();

    if (error || isLoading || busy || !incapacidad) return;
    if (!isGerente && !isRH) return;

    const estado = e.nativeEvent.submitter?.value || (isGerente ? "EN_REVISION_RH" : "APROBADA");

    try {
      setErr(null);
      setBusy(true);

      if (isGerente) {
        await revisarIncapacidadGerente(id, {
          estado,
          observacion: form.observacion,
        });
      } else {
        await resolverIncapacidadRh(id, {
          estado,
          observacion: form.observacion,
        });
      }

      notifySuccess(
        estado === "RECHAZADA"
          ? "Incapacidad rechazada correctamente."
          : isGerente
            ? "Incapacidad enviada a Recursos Humanos."
            : "Incapacidad aprobada correctamente.",
      );
      setForm(emptyForm);
      setReloadKey((prev) => prev + 1);
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDescargar() {
    if (descargando || !incapacidad) return;
    try {
      setErr(null);
      setDescargando(true);
      const archivo = await descargarComprobanteIncapacidad(id);
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = incapacidad.ComprobanteNombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setErr(error.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="incapacidad-detail">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/incapacidades">Incapacidades</Link> / <span>Detalle</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA Y SEGUIMIENTO</p>
          <h1>Detalle de incapacidad</h1>
          <p>Datos, comprobante y avance de la revisión.</p>
        </div>
        <Link className="button button-secondary" to="/incapacidades">
          <ArrowLeft size={16} aria-hidden="true" /> Volver al listado
        </Link>
      </div>

      {isLoading ? (
        <LoadingState entidad="detalle de incapacidad" />
      ) : error ? (
        <AlertMessage title="No se pudo cargar la incapacidad">
          {error}
        </AlertMessage>
      ) : !incapacidad ? (
        <AlertMessage type="info" title="Incapacidad no encontrada">
          No se encontró la solicitud de incapacidad.
        </AlertMessage>
      ) : (
        <>
          <AlertMessage title="No se pudo completar la acción" onClose={() => setErr(null)}>
            {err}
          </AlertMessage>
          <section className="data-panel catalog-form incapacidad-resumen" aria-label="Resumen de la incapacidad">
            <div className="incapacidad-resumen-heading">
              <div>
              <p className="eyebrow accent">
                SOLICITUD #{incapacidad.SolicitudId}
              </p>
                <h2>{incapacidad.TipoIncapacidad} · {incapacidad.EntidadEmisora}</h2>
              </div>
              <span className="solicitud-state" data-estado={incapacidad.Estado}>
                {estadosLabel[incapacidad.Estado]}
              </span>
            </div>
            <dl className="solicitud-details incapacidad-periodo">
              <div><dt>Desde</dt><dd>{formatDate(incapacidad.FechaInicio)}</dd></div>
              <div><dt>Hasta</dt><dd>{formatDate(incapacidad.FechaFin)}</dd></div>
              <div><dt>Duración</dt><dd><CalendarDays size={17} aria-hidden="true" /> {diasIncapacidad} {diasIncapacidad === 1 ? "día" : "días"} calendario</dd></div>
            </dl>

            <ol
              className="solicitud-etapas"
              aria-label="Seguimiento de la solicitud"
            >
              {[
                "Registrada",
                "Revisión de gerencia",
                "Revisión de RH",
                "Resultado",
              ].map((etapa, index) => (
                <li
                  key={etapa}
                  aria-current={etapaActual === index ? "step" : undefined}
                >
                  <span className="incapacidad-etapa-numero" aria-hidden="true">{index + 1}</span>
                  {etapa}
                </li>
              ))}
            </ol>
          </section>

          <div className="solicitud-detail-columns incapacidad-contenido">
            <section
              className="data-panel catalog-form"
              aria-labelledby="incapacidad-datos-titulo"
            >
              <h2 id="incapacidad-datos-titulo"><ClipboardCheck size={20} aria-hidden="true" /> Datos de la solicitud</h2>
              <dl className="solicitud-details">
                <div>
                  <dt>Colaborador</dt>
                  <dd>
                    {incapacidad.Nombres} {incapacidad.Apellidos}
                  </dd>
                </div>
                <div>
                  <dt>Restaurante</dt>
                  <dd>{incapacidad.Restaurante}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>
                    {incapacidad.TipoIncapacidad} · {incapacidad.EntidadEmisora}
                  </dd>
                </div>
                <div>
                  <dt>Porcentaje patronal</dt>
                  <dd>{incapacidad.PorcentajePatronal}%</dd>
                </div>
                <div>
                  <dt>Número de documento</dt>
                  <dd>{incapacidad.NumeroDocumento}</dd>
                </div>
                <div className="solicitud-details-wide solicitud-resolution">
                  <dt>Motivo</dt>
                  <dd>{incapacidad.Motivo || "Sin motivo especificado."}</dd>
                </div>
              </dl>
            </section>
            <div className="solicitud-summary incapacidad-lateral">
              <section
                className="data-panel catalog-form"
                aria-labelledby="incapacidad-adjunto-titulo"
              >
                <h2 id="incapacidad-adjunto-titulo">Comprobante adjunto</h2>
                <div className="incapacidad-comprobante">
                  <FileText size={28} aria-hidden="true" />
                  <div><strong>{incapacidad.ComprobanteNombre}</strong>
                  <p className="solicitud-create-note">Documento presentado por el colaborador.</p></div>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleDescargar}
                  disabled={descargando}
                >
                  <Download size={16} aria-hidden="true" /> {descargando ? "Descargando…" : "Descargar comprobante"}
                </button>
              </section>
              {incapacidad.Estado === "PENDIENTE" ? (
                <form
                  className="data-panel catalog-form solicitud-create-form"
                  aria-labelledby="incapacidad-gerente-titulo"
                  onSubmit={handleSubmit}
                >
                  <h2 id="incapacidad-gerente-titulo">Revisión de gerencia</h2>
                  <p>
                    Revisá los datos y el comprobante antes de enviar la solicitud a
                    Recursos Humanos.
                  </p>
                  {isGerente && (
                    <fieldset aria-label="Observación y acciones de revisión" disabled={busy} aria-busy={busy}>
                      <label
                        className="solicitud-details-wide"
                        htmlFor="incapacidad-observacion-gerente"
                      >
                        Observación (opcional)
                        <textarea
                          id="incapacidad-observacion-gerente"
                          name="observacionGerente"
                          rows={3}
                          maxLength={500}
                          placeholder="Observación de la revisión"
                          value={form.observacion}
                          onChange={(e) =>
                            setForm((prev) => {
                              return { ...prev, observacion: e.target.value };
                            })
                          }
                        />
                      </label>
                      <div className="solicitud-create-actions solicitud-details-wide">
                        <button
                          className="button button-secondary"
                          type="submit"
                          name="estado"
                          value="RECHAZADA"
                        >
                          Rechazar
                        </button>
                        <button className="button button-primary" type="submit" name="estado" value="EN_REVISION_RH">
                          {busy ? "Guardando…" : "Enviar a RH"}
                        </button>
                      </div>
                    </fieldset>
                  )}
                  {!isGerente && <p className="solicitud-create-note">La solicitud está pendiente de revisión por el gerente.</p>}
                </form>
              ) : incapacidad.Estado === "EN_REVISION_RH" ? (
                <form
                  className="data-panel catalog-form solicitud-create-form"
                  aria-labelledby="incapacidad-rh-titulo"
                  onSubmit={handleSubmit}
                >
                  <h2 id="incapacidad-rh-titulo">Resolución de Recursos Humanos</h2>
                  <p>
                    La solicitud fue revisada por gerencia. Al aprobar, se
                    registrará el cálculo de reconocimiento.
                  </p>
                  {isRH && (
                    <fieldset aria-label="Observación y acciones de revisión" disabled={busy} aria-busy={busy}>
                      <label
                        className="solicitud-details-wide"
                        htmlFor="incapacidad-observacion-rh"
                      >
                        Observación (opcional)
                        <textarea
                          id="incapacidad-observacion-rh"
                          name="observacionRh"
                          rows={3}
                          maxLength={500}
                          placeholder="Observación de la revisión"
                          value={form.observacion}
                          onChange={(e) =>
                            setForm((prev) => {
                              return { ...prev, observacion: e.target.value };
                            })
                          }
                        />
                      </label>
                      <div className="solicitud-create-actions solicitud-details-wide">
                        <button
                          className="button button-secondary"
                          type="submit"
                          name="estado"
                          value="RECHAZADA"
                        >
                          Rechazar
                        </button>
                        <button className="button button-primary" type="submit" name="estado" value="APROBADA">
                          {busy ? "Guardando…" : "Aprobar incapacidad"}
                        </button>
                      </div>
                    </fieldset>
                  )}
                  {!isRH && <p className="solicitud-create-note">Recursos Humanos tiene pendiente la resolución de esta solicitud.</p>}
                  {incapacidad.Observacion && <p className="solicitud-create-note">Observación de gerencia: {incapacidad.Observacion}</p>}
                </form>
              ) : incapacidad.Estado === "RECHAZADA" ? (
                <section
                  className="data-panel catalog-form solicitud-create-form"
                  aria-labelledby="incapacidad-seguimiento-titulo"
                >
                  <h2 id="incapacidad-seguimiento-titulo">Seguimiento</h2>
                  <p>La solicitud fue rechazada.</p>
                  <dl className="solicitud-details">
                    <div>
                      <dt>Observación</dt>
                      <dd>{incapacidad.Observacion || "Sin observación."}</dd>
                    </div>
                  </dl>
                </section>
              ) : incapacidad.Estado === "APROBADA" ? (
                <section
                  className="data-panel catalog-form solicitud-create-form"
                  aria-labelledby="incapacidad-aprobada-titulo"
                >
                  <h2 id="incapacidad-aprobada-titulo">Incapacidad aprobada</h2>
                  <p>
                    La solicitud fue aprobada por Recursos Humanos y su cálculo de
                    reconocimiento fue registrado.
                  </p>
                  {incapacidad.Observacion && (
                    <dl className="solicitud-details">
                      <div>
                        <dt>Observación de Recursos Humanos</dt>
                        <dd>{incapacidad.Observacion}</dd>
                      </div>
                    </dl>
                  )}
                </section>
              ) : null}
            </div>
          </div>
          {puedeVerCalculo && (
            <section
              className="data-panel catalog-form incapacidad-calculo"
              aria-labelledby="incapacidad-calculo-titulo"
            >
              <h2 id="incapacidad-calculo-titulo">
                <Calculator size={20} aria-hidden="true" /> Cálculo de incapacidad
              </h2>
              {incapacidad.Estado !== "APROBADA" ? (
                <p className="solicitud-create-note">
                  {incapacidad.Estado === "RECHAZADA"
                    ? "La solicitud fue rechazada y no tiene un cálculo de reconocimiento."
                    : "El cálculo de reconocimiento se registrará cuando Recursos Humanos apruebe la solicitud."}
                </p>
              ) : isLoadingCalculo ? (
                <LoadingState entidad="cálculo de incapacidad" />
              ) : errorCalculo ? (
                <AlertMessage title="No se pudo cargar el cálculo">
                  {errorCalculo}
                </AlertMessage>
              ) : calculo && String(calculo.SolicitudId) === String(incapacidad.SolicitudId) ? (
                <dl className="solicitud-details">
                  <div>
                    <dt>Número de cálculo</dt>
                    <dd>{calculo.CalculoId}</dd>
                  </div>
                  <div>
                    <dt>Solicitud</dt>
                    <dd>#{calculo.SolicitudId}</dd>
                  </div>
                  <div>
                    <dt>Período de planilla</dt>
                    <dd>{calculo.PeriodoId ?? "Sin período asignado"}</dd>
                  </div>
                  <div>
                    <dt>Minutos reconocidos</dt>
                    <dd>{calculo.MinutosReconocidos}</dd>
                  </div>
                  <div>
                    <dt>Porcentaje patronal aplicado</dt>
                    <dd>{calculo.PorcentajePatronalAplicado}%</dd>
                  </div>
                </dl>
              ) : (
                <p className="solicitud-create-note">
                  No hay un cálculo registrado para esta solicitud.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
