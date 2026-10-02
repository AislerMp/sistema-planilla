import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import useAsyncRequest from "../hooks/useAsyncRequest.js";
import AlertMessage from "../components/AlertMessage.jsx";
import LoadingState from "../components/loadingState.jsx";
import { ArrowLeft, RotateCcw, PlusIcon } from "lucide-react";
import { getRestaurantes } from "../services/restaurantes.Service.js";
import {
  getMisSolicitudes,
  getSolicitudesPorRestaurante,
  createSolicitud,
  resolverSolicitud,
} from "../services/horasExtras.Service.js";
import { formatDate } from "../utils/fechaUtils.js";
import Dialog from "../components/dialog.jsx";


const emptyFilters = {
  restauranteId: null,
  desde: "",
  hasta: "",
  estado: null,
};

const estadosSolicitud = [
  { valor: null, etiqueta: "Todas" },
  { valor: "PENDIENTE", etiqueta: "Pendientes" },
  { valor: "APROBADA", etiqueta: "Aprobadas" },
  { valor: "RECHAZADA", etiqueta: "Rechazadas" },
];

const emptyCheckSolicitudForm = {
  id: null,
  estado: "",
  horas: null,
  observacion: "",
};

const emptyCreateSolicitudForm = {
  fechaSolicitada: "",
  horas: null,
  motivo: "",
};

const titulos = {
  crear: "Nueva solicitud",
  detalle: "Detalle de solicitud",
  resolver: "Revisar solicitud",
};

const etiquetasEstado = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const mostrarHoras = (minutos) =>
  minutos == null
    ? "—"
    : `${new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 }).format(minutos / 60)} h`;

export default function SolicitudesHorasExtra() {
  const { user } = useAuth();
  const isColaborador = user?.Rol === "COLABORADOR";
  const isGerente = user?.Rol === "GERENTE";
  const puedeElegirRestaurante = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(
    user?.Rol,
  );
  const [filters, setFilters] = useState(emptyFilters);
  const puedeConsultar =
    !puedeElegirRestaurante || Boolean(filters.restauranteId);

  const [reloadKey, setReloadKey] = useState(0);
  const [filterError, setFilterError] = useState(null);

  const [filterForm, setFilterForm] = useState(emptyFilters);
  const [checkSolicitudForm, setCheckSolicitudForm] = useState(
    emptyCheckSolicitudForm,
  );
  const [crearSolicitudForm, setcrearSolicitudForm] = useState(
    emptyCreateSolicitudForm,
  );

  const {
    data,
    isLoading,
    error: solicitudesError,
  } = useAsyncRequest(() => {
    if (!puedeConsultar) return Promise.resolve([]);
    return isColaborador
      ? getMisSolicitudes(filters)
      : getSolicitudesPorRestaurante(filters);
  }, [filters, isColaborador, puedeConsultar, reloadKey]);

  const solicitudes = data ?? [];

  const {
    data: restaurantesData,
    isLoading: loadingRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("activos") : Promise.resolve([]),
    [puedeElegirRestaurante, user?.UsuarioId],
  );

  const restaurantes = restaurantesData ?? [];

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const fechaHoy = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  function limpiarFiltros() {
    setFilterForm({ ...emptyFilters });
    setFilters({ ...emptyFilters });
    setFilterError(null);
  }

  function handleFilters(event) {
    event.preventDefault();

    if (isLoading) return;
    if (
      filterForm.desde &&
      filterForm.hasta &&
      filterForm.desde > filterForm.hasta
    ) {
      setFilterError("La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }

    if (puedeElegirRestaurante && !filterForm.restauranteId) {
      setFilterError("Selecciona un restaurante.");
      return;
    }
    setFilterError(null);
    setFilters({ ...filterForm });
  }

  async function handleCrearSolicitud(e) {
    e.preventDefault();
    if (isBusy) return;

    if (crearSolicitudForm.fechaSolicitada <= fechaHoy) {
      setError("La fecha solicitada debe ser posterior al día de hoy.");
      return;
    }

    const minutos = Number(crearSolicitudForm.horas) * 60;
    if (!Number.isInteger(minutos) || minutos < 1 || minutos > 2147483647) {
      setError(
        "Las horas deben equivaler a una cantidad entera y positiva de minutos válida.",
      );
      return;
    }

    const motivo = crearSolicitudForm.motivo.trim();
    if (!motivo || motivo.length > 500) {
      setError("Ingresá un motivo de hasta 500 caracteres.");
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      await createSolicitud({
        fechaSolicitada: crearSolicitudForm.fechaSolicitada,
        minutosSolicitados: minutos,
        motivo,
      });
      setcrearSolicitudForm({ ...emptyCreateSolicitudForm });
      setReloadKey((current) => current + 1);
    } catch (err) {
      setError(err.message || "No se pudo crear la solicitud.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResolverSolicitud(e) {
    e.preventDefault();
    if (isBusy) return;

    const observacion = checkSolicitudForm.observacion.trim();
    if (observacion.length > 500) {
      setError("Ingresá una observacion de hasta 500 caracteres.");
      return;
    }

    const minutosAutorizados =
      checkSolicitudForm.estado === "APROBADA"
        ? Math.round(Number(checkSolicitudForm.horas) * 60)
        : 0;
    if (!["APROBADA", "RECHAZADA"].includes(checkSolicitudForm.estado)) {
      setError("Seleccioná aprobar o rechazar.");
      return;
    }
    if (
      checkSolicitudForm.estado === "APROBADA" &&
      (!Number.isFinite(minutosAutorizados) ||
        minutosAutorizados < 1 ||
        minutosAutorizados > dialog.solicitud.MinutosSolicitados)
    ) {
      setError(
        "Las horas autorizadas deben ser mayores que cero y no superar las solicitadas.",
      );
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      await resolverSolicitud(Number(checkSolicitudForm.id), {
        estado: checkSolicitudForm.estado,
        minutosAutorizados,
        observacion,
      });
      setCheckSolicitudForm({ ...emptyCheckSolicitudForm });
      setDialog(null);
      setReloadKey((current) => current + 1);
    } catch (err) {
      setError(err.message || "No se pudo confirmar la solicitud.");
    } finally {
      setIsBusy(false);
    }
  }

  function cerrarDialog() {
    if (isBusy) return;
    setError(null);
    setDialog(null);
  }

  function abrirSolicitud(tipo, solicitud) {
    setError(null);
    if (tipo === "resolver") {
      setCheckSolicitudForm({
        id: solicitud.SolicitudHoraExtraId,
        estado: "APROBADA",
        horas: solicitud.MinutosSolicitados / 60,
        observacion: "",
      });
    }
    setDialog({ tipo, solicitud });
  }

  const seleccionada = dialog?.solicitud;

  const nombreColaborador = (solicitud) =>
    [solicitud.Nombres, solicitud.Apellidos].filter(Boolean).join(" ") ||
    `Colaborador #${solicitud.ColaboradorId}`;

  const nombreRestaurante = (solicitud) =>
    restaurantes.find(
      (restaurante) =>
        Number(restaurante.RestauranteId) === Number(solicitud.RestauranteId),
    )?.Nombre || `Restaurante #${solicitud.RestauranteId}`;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Inicio</Link> / <span>Solicitudes</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">
            {isColaborador
              ? "Mis solicitudes"
              : isGerente
                ? "MI RESTAURANTE"
                : "ADMINISTRACIÓN"}
          </p>
          <h1>Solicitudes de horas extras </h1>
          <p>
            {isColaborador
              ? "Consulta tus solicitudes y crea tu nueva solicitud"
              : "Revisá las solicitudes de tu equipo y autorizá las horas."}
          </p>
        </div>

        <Link className="button button-secondary" to="/asistencia">
          <ArrowLeft size={17} aria-hidden="true" /> Volver al menú
        </Link>
      </div>

      {isColaborador && (
        <div className="solicitudes-actions">
          <button
            type="button"
            className="button button-primary solicitudes-create-button"
            aria-haspopup="dialog"
            onClick={() => setDialog({ tipo: "crear" })}
          >
            <PlusIcon size={18} aria-hidden="true" />
            <span>Nueva solicitud</span>
          </button>
        </div>
      )}

      <AlertMessage>{error || filterError || solicitudesError}</AlertMessage>

      <form
        className="solicitudes-filters data-panel"
        onSubmit={handleFilters}
        aria-label="Filtros de solicitudes"
      >
        <div
          className="solicitudes-status-tabs"
          role="group"
          aria-label="Estado de las solicitudes"
        >
          {estadosSolicitud.map(({ valor, etiqueta }) => (
            <button
              key={valor ?? "todas"}
              type="button"
              className="solicitudes-status-tab"
              aria-pressed={filterForm.estado === valor}
              onClick={() =>
                setFilterForm((current) => ({ ...current, estado: valor }))
              }
            >
              {etiqueta}
              <span className="solicitudes-status-count">
                {isLoading || solicitudesError || !puedeConsultar
                  ? "—"
                  : valor === null
                    ? solicitudes.length
                    : solicitudes.filter(
                        (solicitud) => solicitud.Estado === valor,
                      ).length}
              </span>
            </button>
          ))}
        </div>
        <fieldset
          disabled={isLoading}
          aria-label="Fechas y restaurante"
          aria-busy={isLoading}
        >
          <label htmlFor="marks-desde">
            Fecha solicitada desde
            <input
              id="marks-desde"
              name="desde"
              type="date"
              value={filterForm.desde}
              max={filterForm.hasta || undefined}
              onChange={(event) => {
                setFilterForm({ ...filterForm, desde: event.target.value });
              }}
            />
          </label>
          <label htmlFor="marks-hasta">
            Hasta
            <input
              id="marks-hasta"
              name="hasta"
              type="date"
              value={filterForm.hasta}
              min={filterForm.desde || undefined}
              onChange={(event) => {
                setFilterForm({ ...filterForm, hasta: event.target.value });
              }}
            />
          </label>
          {puedeElegirRestaurante && (
            <label className="solicitudes-restaurante" htmlFor="restauranteId">
              Restaurante
              <select
                id="restauranteId"
                value={filterForm.restauranteId ?? ""}
                disabled={loadingRestaurantes}
                onChange={(event) => {
                  setFilterError("");
                  setFilterForm({
                    ...filterForm,
                    restauranteId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  });
                }}
              >
                <option value="">
                  {loadingRestaurantes
                    ? "Cargando restaurantes..."
                    : errorRestaurantes
                      ? "No se pudieron cargar"
                      : restaurantes.length === 0
                        ? "No hay restaurantes activos"
                        : "Selecciona un restaurante"}
                </option>
                {restaurantes.map((restaurante) => (
                  <option
                    key={restaurante.RestauranteId}
                    value={restaurante.RestauranteId}
                  >
                    {restaurante.Nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="solicitudes-filter-actions">
          <button
            className="button button-secondary"
            type="submit"
          >
            Aplicar filtros
          </button>
          <button type="button" className="button button-secondary" onClick={limpiarFiltros}>
            <RotateCcw size={16} aria-hidden="true" />
            Limpiar filtros
          </button>
          </div>
        </fieldset>
      </form>
      <section className="data-panel" aria-label="Solicitudes de horas extras">
        {!puedeConsultar ? (
          <p className="catalog-message">
            Seleccioná un restaurante y aplicá los filtros.
          </p>
        ) : isLoading ? (
          <LoadingState entidad="solicitudes" />
        ) : solicitudesError ? (
          <p className="catalog-message">
            No se pudieron cargar las solicitudes.
          </p>
        ) : solicitudes.length === 0 ? (
          <p className="catalog-message">
            No hay solicitudes para estos filtros.
          </p>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Listado de solicitudes"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Solicitud</th>
                  <th scope="col">Fecha solicitada</th>
                  <th scope="col">Horas</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((solicitud) => (
                  <tr key={solicitud.SolicitudHoraExtraId}>
                    <td>
                      #{solicitud.SolicitudHoraExtraId} ·{" "}
                      {nombreColaborador(solicitud)}
                    </td>
                    <td>{formatDate(solicitud.FechaSolicitada)}</td>
                    <td>{mostrarHoras(solicitud.MinutosSolicitados)}</td>
                    <td>
                      <span
                        className="solicitud-state"
                        data-estado={solicitud.Estado}
                      >
                        {etiquetasEstado[solicitud.Estado]}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="table-action-button"
                          aria-haspopup="dialog"
                          onClick={() => abrirSolicitud("detalle", solicitud)}
                        >
                          Ver detalle
                        </button>
                        {(isGerente || puedeElegirRestaurante) &&
                          solicitud.Estado === "PENDIENTE" &&
                          String(solicitud.FechaSolicitada).slice(0, 10) >
                            fechaHoy && (
                            <button
                              type="button"
                              className="table-action-button"
                              aria-haspopup="dialog"
                              onClick={() =>
                                abrirSolicitud("resolver", solicitud)
                              }
                            >
                              Revisar
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog && (
        <Dialog
          titulo={titulos[dialog.tipo]}
          subtitulo={
            seleccionada
              ? `Solicitud #${seleccionada.SolicitudHoraExtraId} · ${nombreRestaurante(seleccionada)}`
              : undefined
          }
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          {dialog.tipo === "crear" && (
            <form
              className="solicitud-create-form"
              onSubmit={handleCrearSolicitud}
            >
              <fieldset disabled={isBusy} aria-busy={isBusy}>
                <label htmlFor="fechaAsignada">
                  Fecha para trabajar horas extras
                  <input
                    id="fechaAsignada"
                    required
                    autoFocus
                    value={crearSolicitudForm.fechaSolicitada}
                    type="date"
                    onChange={(e) =>
                      setcrearSolicitudForm({
                        ...crearSolicitudForm,
                        fechaSolicitada: e.target.value,
                      })
                    }
                  />
                </label>
                <label htmlFor="horas">
                  Horas solicitadas
                  <input
                    id="horas"
                    value={crearSolicitudForm.horas ?? ""}
                    type="number"
                    required
                    min="0"
                    step="any"
                    placeholder="Ej. 2"
                    onChange={(e) =>
                      setcrearSolicitudForm({
                        ...crearSolicitudForm,
                        horas: e.target.value,
                      })
                    }
                  />
                </label>
                <label htmlFor="motivo">
                  Motivo
                  <textarea
                    id="motivo"
                    value={crearSolicitudForm.motivo}
                    required
                    rows={3}
                    maxLength={500}
                    placeholder="Ej. Apoyo al cierre y conteo de inventario."
                    onChange={(e) =>
                      setcrearSolicitudForm({
                        ...crearSolicitudForm,
                        motivo: e.target.value,
                      })
                    }
                  />
                </label>
                <p className="solicitud-create-note">
                  La solicitud quedará pendiente de revisión.
                </p>
                <AlertMessage>{error}</AlertMessage>
                <footer className="solicitud-create-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={cerrarDialog}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="button button-primary">
                    {isBusy ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </footer>
              </fieldset>
            </form>
          )}

          {seleccionada && (
            <div className="solicitud-summary">
              <span
                className="solicitud-state"
                data-estado={seleccionada.Estado}
              >
                {etiquetasEstado[seleccionada.Estado]}
              </span>
              <dl className="solicitud-details">
                <div>
                  <dt>Colaborador</dt>
                  <dd>{nombreColaborador(seleccionada)}</dd>
                </div>
                <div>
                  <dt>Fecha solicitada</dt>
                  <dd>{formatDate(seleccionada.FechaSolicitada)}</dd>
                </div>
                <div>
                  <dt>Horas solicitadas</dt>
                  <dd>{mostrarHoras(seleccionada.MinutosSolicitados)}</dd>
                </div>
                <div>
                  <dt>Horas autorizadas</dt>
                  <dd>
                    {seleccionada.Estado === "PENDIENTE"
                      ? "—"
                      : mostrarHoras(seleccionada.MinutosAutorizados)}
                  </dd>
                </div>
                <div className="solicitud-details-wide">
                  <dt>Motivo</dt>
                  <dd>{seleccionada.Motivo || "Sin motivo registrado."}</dd>
                </div>
              </dl>
            </div>
          )}

          {dialog.tipo === "detalle" && seleccionada && (
            <>
              {seleccionada.Estado !== "PENDIENTE" && (
                <dl className="solicitud-review-details">
                  <div>
                    <dt>Revisado por</dt>
                    <dd>
                      {seleccionada.RevisadoPorUsuarioId
                        ? `Usuario #${seleccionada.RevisadoPorUsuarioId}`
                        : "Sin información registrada"}
                    </dd>
                  </div>
                  <div>
                    <dt>Observación</dt>
                    <dd>{seleccionada.Observacion || "Sin observación."}</dd>
                  </div>
                </dl>
              )}
              <footer className="solicitud-create-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={cerrarDialog}
                >
                  Cerrar
                </button>
              </footer>
            </>
          )}

          {dialog.tipo === "resolver" && seleccionada && (
            <form
              className="solicitud-create-form solicitud-resolution"
              onSubmit={handleResolverSolicitud}
            >
              <fieldset disabled={isBusy} aria-busy={isBusy}>
                <fieldset className="solicitud-decision">
                  <legend>Resolución</legend>
                  {[
                    { valor: "APROBADA", texto: "Aprobar" },
                    { valor: "RECHAZADA", texto: "Rechazar" },
                  ].map(({ valor, texto }) => (
                    <label key={valor}>
                      <input
                        type="radio"
                        name="resolucion"
                        value={valor}
                        checked={checkSolicitudForm.estado === valor}
                        onChange={() => {
                          setCheckSolicitudForm((current) => ({
                            ...current,
                            estado: valor,
                          }));
                          setError(null);
                        }}
                      />
                      <span>{texto}</span>
                    </label>
                  ))}
                </fieldset>
                {checkSolicitudForm.estado === "APROBADA" ? (
                  <>
                    <p className="solicitud-create-note" id="limite-horas">
                      Podés autorizar todo o una parte. Máximo:{" "}
                      {mostrarHoras(seleccionada.MinutosSolicitados)}.
                    </p>
                    <label htmlFor="horas-autorizadas">
                      Horas autorizadas
                      <input
                        id="horas-autorizadas"
                        type="number"
                        min="0"
                        max={seleccionada.MinutosSolicitados / 60}
                        step="any"
                        required
                        aria-describedby="limite-horas"
                        value={checkSolicitudForm.horas ?? ""}
                        onChange={(event) =>
                          setCheckSolicitudForm((current) => ({
                            ...current,
                            horas: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </>
                ) : (
                  <p className="solicitud-create-note">
                    La solicitud quedará rechazada, sin horas autorizadas.
                  </p>
                )}
                <label htmlFor="solicitud-observacion">
                  Observación (opcional)
                  <textarea
                    id="solicitud-observacion"
                    rows={3}
                    maxLength={500}
                    placeholder="Ej. Se autoriza una hora para apoyar el cierre."
                    value={checkSolicitudForm.observacion}
                    onChange={(event) =>
                      setCheckSolicitudForm((current) => ({
                        ...current,
                        observacion: event.target.value,
                      }))
                    }
                  />
                </label>
                <AlertMessage>{error}</AlertMessage>
                <footer className="solicitud-create-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={cerrarDialog}
                  >
                    Cerrar
                  </button>
                  <button type="submit" className="button button-primary">
                    {isBusy
                      ? "Guardando..."
                      : checkSolicitudForm.estado === "APROBADA"
                        ? "Confirmar aprobación"
                        : "Confirmar rechazo"}
                  </button>
                </footer>
              </fieldset>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
