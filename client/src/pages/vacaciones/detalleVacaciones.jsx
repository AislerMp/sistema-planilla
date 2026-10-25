import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Calculator,
  ClipboardCheck,
  History,
  Undo2,
} from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import {
  getMiSaldoVacaciones,
  getVacacionById,
  revertirVacaciones,
  getSaldoVacacionesByColaborador,
  getCalculosVacaciones,
  revisarVacacionesGerente,
  resolverVacacionesRh,
} from "../../services/vacaciones.Service.js";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import LoadingState from "../../components/loadingState.jsx";
import { formatDate } from "../../utils/fechaUtils.js";
import {
  confirmarAprobacion,
  confirmarReversion,
  notifySuccess,
} from "../../utils/notifications.js";

const estadosLabel = {
  PENDIENTE: "Pendiente de revisión de gerencia",
  EN_REVISION_RH: "En revisión de Recursos Humanos",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

export default function DetalleVacaciones() {
  const { id } = useParams();
  // Al cambiar de solicitud se reinician sus consultas, errores y formulario.
  return <ContenidoDetalleVacaciones key={id} id={id} />;
}

function ContenidoDetalleVacaciones({ id }) {
  const { user } = useAuth();

  const isColaborador = user?.Rol === "COLABORADOR";
  const isGerente = user?.Rol === "GERENTE";
  const isRH = user?.Rol === "RECURSOS_HUMANOS";
  const puedeVerCalculo = isRH || user?.Rol === "ADMINISTRADOR";
  const puedeVerSaldo = isColaborador || puedeVerCalculo;
  const [observacion, setObservacion] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorAccion, setErrorAccion] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reloadSaldoKey, setReloadSaldoKey] = useState(0);
  const [reloadCalculosKey, setReloadCalculosKey] = useState(0);
  const operacionEnCurso = useRef(false);

  const {
    data: vacaciones,
    isLoading,
    error,
  } = useAsyncRequest(() => getVacacionById(id), [id, reloadKey]);

  const colaboradorSaldoId =
    puedeVerSaldo && !isLoading && !error ? vacaciones?.ColaboradorId : null;

  const {
    data: saldo,
    isLoading: isLoadingSaldo,
    error: errorSaldo,
  } = useAsyncRequest(() => {
    if (colaboradorSaldoId == null) return Promise.resolve(null);
    return isColaborador
      ? getMiSaldoVacaciones()
      : getSaldoVacacionesByColaborador(colaboradorSaldoId);
  }, [colaboradorSaldoId, isColaborador, reloadKey, reloadSaldoKey]);

  const solicitudCalculosId =
    puedeVerCalculo && !isLoading && !error && vacaciones?.Estado === "APROBADA"
      ? vacaciones.SolicitudId
      : null;
  const {
    data: calculosData,
    isLoading: isLoadingCalculos,
    error: errorCalculos,
  } = useAsyncRequest(
    () =>
      solicitudCalculosId != null
        ? getCalculosVacaciones(solicitudCalculosId)
        : Promise.resolve([]),
    [solicitudCalculosId, reloadKey, reloadCalculosKey],
  );
  const calculos = calculosData ?? [];
  const puedeRevisarGerencia = isGerente && vacaciones?.Estado === "PENDIENTE";
  const puedeResolverRh = isRH && vacaciones?.Estado === "EN_REVISION_RH";
  const puedeResolver = puedeRevisarGerencia || puedeResolverRh;
  let estadoReversion = null;
  if (vacaciones?.RevisadoPorGerenteId != null) {
    if (
      isGerente &&
      vacaciones.RevisadoPorRhId == null &&
      ["EN_REVISION_RH", "RECHAZADA"].includes(vacaciones.Estado)
    ) {
      estadoReversion = "PENDIENTE";
    } else if (
      isRH &&
      vacaciones.RevisadoPorRhId != null &&
      vacaciones.Estado === "RECHAZADA"
    ) {
      estadoReversion = "EN_REVISION_RH";
    }
  }

  const etapaActual =
    {
      PENDIENTE: 1,
      EN_REVISION_RH: 2,
      APROBADA: 3,
      RECHAZADA: 3,
    }[vacaciones?.Estado] ?? 0;

  async function revisarSolicitud(event) {
    event.preventDefault();
    if (
      !puedeResolver ||
      isLoading ||
      error ||
      busy ||
      operacionEnCurso.current
    )
      return;

    const estado = event.nativeEvent?.submitter?.value;
    const estadoAprobacion = puedeRevisarGerencia
      ? "EN_REVISION_RH"
      : "APROBADA";
    if (!["RECHAZADA", estadoAprobacion].includes(estado)) {
      setErrorAccion(
        "Seleccioná si querés rechazar o continuar con la solicitud.",
      );
      return;
    }
    const observacionValidada = observacion.trim();
    if (observacionValidada.length > 500) {
      setErrorAccion("La observación no puede superar los 500 caracteres.");
      return;
    }

    operacionEnCurso.current = true;
    setBusy(true);
    setErrorAccion(null);
    try {
      if (estado !== "RECHAZADA") {
        const confirmado = await confirmarAprobacion({
          tipoSolicitud: "vacaciones",
          solicitudId: vacaciones.SolicitudId,
          enviarARh: puedeRevisarGerencia,
        });
        if (!confirmado) return;
      }
      const revisar = puedeRevisarGerencia
        ? revisarVacacionesGerente
        : resolverVacacionesRh;
      await revisar(id, { estado, observacion: observacionValidada });
      setObservacion("");
      setReloadKey((current) => current + 1);
      notifySuccess(
        estado === "RECHAZADA"
          ? "Solicitud de vacaciones rechazada correctamente."
          : puedeRevisarGerencia
            ? "Solicitud de vacaciones enviada a Recursos Humanos."
            : "Vacaciones aprobadas correctamente.",
      );
    } catch (requestError) {
      setErrorAccion(
        requestError.message || "No se pudo guardar la revisión de vacaciones.",
      );
    } finally {
      operacionEnCurso.current = false;
      setBusy(false);
    }
  }

  async function deshacerRevision() {
    if (
      !estadoReversion ||
      isLoading ||
      error ||
      busy ||
      operacionEnCurso.current
    )
      return;
    operacionEnCurso.current = true;
    setBusy(true);
    setErrorAccion(null);
    try {
      const motivo = await confirmarReversion(estadoReversion);
      if (motivo === null) return;
      await revertirVacaciones(id, { motivo });
      setObservacion("");
      setReloadKey((current) => current + 1);
      notifySuccess("Revisión de vacaciones revertida correctamente.");
    } catch (requestError) {
      setErrorAccion(
        requestError.message ||
          "No se pudo deshacer la revisión de vacaciones.",
      );
    } finally {
      operacionEnCurso.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="incapacidad-detail">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/vacaciones">Vacaciones</Link> / <span>Detalle</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA Y SEGUIMIENTO</p>
          <h1>Detalle de vacaciones</h1>
          <p>Fechas, revisión y reconocimiento por período de planilla.</p>
        </div>
        <Link className="button button-secondary" to="/vacaciones">
          <ArrowLeft size={16} aria-hidden="true" /> Volver al listado
        </Link>
      </div>

      {isLoading ? (
        <LoadingState entidad="detalle de vacaciones" />
      ) : error ? (
        <section className="data-panel catalog-form">
          <AlertMessage title="No se pudo cargar la solicitud de vacaciones">
            {error}
          </AlertMessage>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Reintentar consulta
          </button>
        </section>
      ) : !vacaciones ? (
        <AlertMessage type="info" title="Solicitud no encontrada">
          No se encontró la solicitud de vacaciones.
        </AlertMessage>
      ) : (
        <>
          <AlertMessage onClose={() => setErrorAccion(null)}>
            {errorAccion}
          </AlertMessage>
          <section
            className="data-panel catalog-form"
            aria-labelledby="vacaciones-resumen-titulo"
          >
            <div className="incapacidad-resumen-heading">
              <div>
                <p className="eyebrow accent">
                  SOLICITUD #{vacaciones.SolicitudId}
                </p>
                <h2 id="vacaciones-resumen-titulo">Vacaciones solicitadas</h2>
              </div>
              <span className="solicitud-state" data-estado={vacaciones.Estado}>
                {estadosLabel[vacaciones.Estado] ?? vacaciones.Estado}
              </span>
            </div>
            <dl className="solicitud-details incapacidad-periodo">
              <div>
                <dt>Desde</dt>
                <dd>{formatDate(vacaciones.FechaInicio)}</dd>
              </div>
              <div>
                <dt>Hasta</dt>
                <dd>{formatDate(vacaciones.FechaFin)}</dd>
              </div>
              <div>
                <dt>Duración</dt>
                <dd>
                  <CalendarDays size={17} aria-hidden="true" />{" "}
                  {vacaciones.DiasSolicitados}{" "}
                  {vacaciones.DiasSolicitados === 1 ? "día" : "días"} calendario
                </dd>
              </div>
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
                  <span className="incapacidad-etapa-numero" aria-hidden="true">
                    {index + 1}
                  </span>
                  {etapa}
                </li>
              ))}
            </ol>
          </section>

          <div className="solicitud-detail-columns incapacidad-contenido">
            <div className="solicitud-summary incapacidad-lateral">
              <section
                className="data-panel catalog-form"
                aria-labelledby="vacaciones-datos-titulo"
              >
                <h2 id="vacaciones-datos-titulo">
                  <ClipboardCheck size={20} aria-hidden="true" /> Datos de la
                  solicitud
                </h2>
                <dl className="solicitud-details">
                  <div>
                    <dt>Colaborador</dt>
                    <dd>
                      {vacaciones.Nombres} {vacaciones.Apellidos}
                    </dd>
                  </div>
                  <div>
                    <dt>Restaurante</dt>
                    <dd>{vacaciones.Restaurante}</dd>
                  </div>
                  <div>
                    <dt>Días solicitados</dt>
                    <dd>{vacaciones.DiasSolicitados} días</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {estadosLabel[vacaciones.Estado] ?? vacaciones.Estado}
                    </dd>
                  </div>
                  <div className="solicitud-details-wide solicitud-resolution">
                    <dt>Motivo</dt>
                    <dd>{vacaciones.Motivo || "Sin motivo especificado."}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="data-panel catalog-form"
                aria-labelledby="vacaciones-seguimiento-titulo"
              >
                <h2 id="vacaciones-seguimiento-titulo">
                  <History size={20} aria-hidden="true" /> Seguimiento
                </h2>
                <dl className="solicitud-review-details">
                  <div>
                    <dt>Registro de la solicitud</dt>
                    <dd>Solicitud enviada por el colaborador.</dd>
                  </div>
                  <div>
                    <dt>Revisión de Gerencia</dt>
                    <dd>
                      {vacaciones.RevisadoPorGerenteId == null
                        ? "Pendiente de revisión."
                        : vacaciones.Estado === "RECHAZADA" &&
                            vacaciones.RevisadoPorRhId == null
                          ? "Solicitud rechazada por gerencia."
                          : "Solicitud revisada y enviada a Recursos Humanos."}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      Observación{" "}
                      {vacaciones.RevisadoPorRhId != null
                        ? "de RH"
                        : vacaciones.RevisadoPorGerenteId != null
                          ? "de gerencia"
                          : "de revisión"}
                    </dt>
                    <dd>{vacaciones.Observacion || "Sin observación."}</dd>
                  </div>
                  <div>
                    <dt>Resolución de RH</dt>
                    <dd>
                      {vacaciones.RevisadoPorRhId != null
                        ? vacaciones.Estado === "APROBADA"
                          ? "Vacaciones aprobadas."
                          : "Solicitud rechazada por Recursos Humanos."
                        : vacaciones.Estado === "RECHAZADA"
                          ? "No pasó a revisión de RH."
                          : "Pendiente de resolución."}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="solicitud-summary incapacidad-lateral">
              {puedeVerSaldo && (
                <section
                  className="data-panel catalog-form"
                  aria-labelledby="vacaciones-saldo-titulo"
                >
                  <h2 id="vacaciones-saldo-titulo">
                    <CalendarDays size={20} aria-hidden="true" /> Saldo actual
                  </h2>
                  {isLoadingSaldo ? (
                    <LoadingState entidad="saldo de vacaciones" compacto />
                  ) : errorSaldo ? (
                    <>
                      <AlertMessage title="No se pudo cargar el saldo">
                        {errorSaldo}
                      </AlertMessage>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          setReloadSaldoKey((current) => current + 1)
                        }
                      >
                        Reintentar saldo
                      </button>
                    </>
                  ) : saldo ? (
                    <dl className="solicitud-details">
                      <div>
                        <dt>Días acumulados</dt>
                        <dd>{saldo.DiasAcumulados} días</dd>
                      </div>
                      <div>
                        <dt>Días utilizados</dt>
                        <dd>{saldo.DiasUtilizados} días</dd>
                      </div>
                      <div>
                        <dt>Días disponibles</dt>
                        <dd className="accent">{saldo.DiasDisponibles} días</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="solicitud-create-note">
                      No hay un saldo de vacaciones disponible para este
                      colaborador.
                    </p>
                  )}
                </section>
              )}
              {puedeResolver ? (
                <form
                  className="data-panel catalog-form solicitud-create-form"
                  onSubmit={revisarSolicitud}
                  aria-labelledby="vacaciones-revision-titulo"
                >
                  <h2 id="vacaciones-revision-titulo">
                    {puedeRevisarGerencia
                      ? "Revisión de Gerencia"
                      : "Resolución de Recursos Humanos"}
                  </h2>
                  <p>
                    {puedeRevisarGerencia
                      ? "Revisá las fechas y la disponibilidad del equipo antes de enviar a RH."
                      : "Al aprobar, el reconocimiento se distribuirá entre los períodos que correspondan a las fechas solicitadas."}
                  </p>
                  <fieldset disabled={busy} aria-busy={busy}>
                    <legend className="sr-only">
                      Observación y acciones de revisión
                    </legend>
                    <label
                      className="solicitud-details-wide"
                      htmlFor="vacaciones-observacion"
                    >
                      Observación (opcional)
                      <textarea
                        id="vacaciones-observacion"
                        name="observacion"
                        rows={3}
                        maxLength={500}
                        placeholder="Observación de la revisión"
                        value={observacion}
                        onChange={(event) => setObservacion(event.target.value)}
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
                      <button
                        className="button button-primary"
                        type="submit"
                        name="estado"
                        value={
                          puedeRevisarGerencia ? "EN_REVISION_RH" : "APROBADA"
                        }
                      >
                        {busy
                          ? "Guardando…"
                          : puedeRevisarGerencia
                            ? "Enviar a RH"
                            : "Aprobar vacaciones"}
                      </button>
                    </div>
                  </fieldset>
                </form>
              ) : (
                <section
                  className="data-panel catalog-form"
                  aria-labelledby="vacaciones-resultado-titulo"
                >
                  <h2 id="vacaciones-resultado-titulo">
                    Estado de la solicitud
                  </h2>
                  <p>
                    {vacaciones.Estado === "PENDIENTE"
                      ? "La solicitud está pendiente de revisión por el gerente."
                      : vacaciones.Estado === "EN_REVISION_RH"
                        ? "La solicitud está pendiente de resolución por Recursos Humanos."
                        : vacaciones.Estado === "APROBADA"
                          ? "Las vacaciones fueron aprobadas por Recursos Humanos."
                          : "La solicitud de vacaciones fue rechazada. Consultá la observación de la revisión."}
                  </p>
                </section>
              )}

              {estadoReversion && (
                <section
                  className="data-panel catalog-form solicitud-create-form incapacidad-calculo"
                  aria-labelledby="vacaciones-reversion-titulo"
                >
                  <h2 id="vacaciones-reversion-titulo">
                    <Undo2 size={20} aria-hidden="true" /> Deshacer revisión
                  </h2>
                  <AlertMessage type="info" title="Motivo de la reversión">
                    Al deshacer la revisión se solicitará un motivo, que quedará
                    registrado en la bitácora.
                  </AlertMessage>
                  <div className="solicitud-create-actions solicitud-details-wide">
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={busy}
                      onClick={deshacerRevision}
                    >
                      <Undo2 size={16} aria-hidden="true" />{" "}
                      {busy ? "Procesando…" : "Deshacer revisión"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>

          {puedeVerCalculo && (
            <section
              className="data-panel incapacidad-calculo"
              aria-labelledby="vacaciones-calculos-titulo"
            >
              <div className="table-toolbar">
                <div>
                  <h2 id="vacaciones-calculos-titulo">
                    <Calculator size={20} aria-hidden="true" /> Reconocimiento
                    por período
                  </h2>
                  <p className="solicitud-create-note">
                    Distribución de los días y minutos reconocidos en planilla.
                  </p>
                </div>
              </div>
              <div
                className="table-scroll"
                role="region"
                aria-label="Cálculos de vacaciones por período"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Período</th>
                      <th scope="col">Desde</th>
                      <th scope="col">Hasta</th>
                      <th scope="col">Días reconocidos</th>
                      <th scope="col">Horas reconocidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacaciones.Estado !== "APROBADA" ? (
                      <tr>
                        <td colSpan={5} className="catalog-message">
                          {vacaciones.Estado === "RECHAZADA"
                            ? "La solicitud fue rechazada y no tiene reconocimiento en planilla."
                            : "Los cálculos se mostrarán cuando Recursos Humanos apruebe la solicitud."}
                        </td>
                      </tr>
                    ) : isLoadingCalculos ? (
                      <tr>
                        <td colSpan={5}>
                          <LoadingState
                            entidad="cálculos de vacaciones"
                            compacto
                          />
                        </td>
                      </tr>
                    ) : errorCalculos ? (
                      <tr>
                        <td colSpan={5}>
                          <AlertMessage title="No se pudieron cargar los cálculos">
                            {errorCalculos}
                          </AlertMessage>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() =>
                              setReloadCalculosKey((current) => current + 1)
                            }
                          >
                            Reintentar cálculos
                          </button>
                        </td>
                      </tr>
                    ) : calculos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="catalog-message">
                          No hay cálculos registrados para esta solicitud.
                        </td>
                      </tr>
                    ) : (
                      calculos.map((calculo) => (
                        <tr key={calculo.CalculoVacacionId}>
                          <td>#{calculo.PeriodoId}</td>
                          <td>{formatDate(calculo.FechaInicioReconocida)}</td>
                          <td>{formatDate(calculo.FechaFinReconocida)}</td>
                          <td>{calculo.DiasReconocidos}</td>
                          <td>{calculo.MinutosReconocidos / 60}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
