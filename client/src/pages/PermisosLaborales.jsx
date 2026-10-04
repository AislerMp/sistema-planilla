import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, PlusIcon } from "lucide-react";
import AlertMessage from "../components/AlertMessage.jsx";
import Dialog from "../components/dialog.jsx";
import LoadingState from "../components/loadingState.jsx";
import SolicitudesFiltros from "../components/SolicitudesFiltros.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAsyncRequest from "../hooks/useAsyncRequest.js";

import {
  getPermisosDeMiRestaurante,
  getPermisosAdministracion,
  getMisPermisos,
  getPermisosPorRestaurante,
  resolverPermisoLaboral,
  solicitarPermisoLaboral,
} from "../services/permisosLaborales.Service.js";

import { getRestaurantes } from "../services/restaurantes.Service.js";
import { formatDate } from "../utils/fechaUtils.js";

const estadosLabel = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const formSolicitudVacio = { fechaSolicitada: "", motivo: "" };
const formRevisionVacio = { estado: "APROBADA", observacion: "" };

function obtenerFechaHoy() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function obtenerFechaManana(fechaHoy) {
  const fecha = new Date(`${fechaHoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}

export default function PermisosLaborales() {
  const { user } = useAuth();
  const esColaborador = user?.Rol === "COLABORADOR";
  const esGerente = user?.Rol === "GERENTE";
  const puedeElegirRestaurante = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(
    user?.Rol,
  );


  const [filters, setFilters] = useState({
    restauranteId: null,
    desde: "",
    hasta: "",
    estado: null,
  });

  const [formSolicitud, setFormSolicitud] = useState(formSolicitudVacio);
  const [formRevision, setFormRevision] = useState(formRevisionVacio);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const puedeConsultar = esColaborador || esGerente || puedeElegirRestaurante;

  const {
    data: permisosData,
    isLoading,
    error: errorPermisos,
  } = useAsyncRequest(() => {
    if (!puedeConsultar) return Promise.resolve([]);
    return esColaborador
      ? getMisPermisos(filters)
      : esGerente
        ? getPermisosDeMiRestaurante(filters)
        : getPermisosAdministracion(filters);
  }, [filters, reloadKey]);

  const permisos = permisosData ?? [];

  const {
    data: restaurantesData,
    isLoading: cargandoRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("activos") : Promise.resolve([]),
    [puedeElegirRestaurante],
  );

  const restaurantes = restaurantesData ?? [];

  const fechaHoy = obtenerFechaHoy();
  const fechaMinimaSolicitud = obtenerFechaManana(fechaHoy);

  const nombreColaborador = (permiso) =>
    [permiso.Nombres, permiso.Apellidos].filter(Boolean).join(" ") ||
    `Colaborador #${permiso.ColaboradorId}`;

  const nombreRestaurante = (permiso) =>
    restaurantes.find(
      (restaurante) =>
        Number(restaurante.RestauranteId) === Number(permiso.RestauranteId),
    )?.Nombre || `Restaurante #${permiso.RestauranteId}`;

  async function crearSolicitud(event) {
    event.preventDefault();
    if (isBusy) return;

    if (formSolicitud.fechaSolicitada < fechaMinimaSolicitud) {
      setError("La fecha solicitada debe ser posterior al día de hoy.");
      return;
    }
    const motivo = formSolicitud.motivo.trim();
    if (!motivo || motivo.length > 500) {
      setError("Ingresá un motivo de hasta 500 caracteres.");
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      await solicitarPermisoLaboral({
        fechaSolicitada: formSolicitud.fechaSolicitada,
        motivo,
      });
      setFormSolicitud(formSolicitudVacio);
      setDialog(null);
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message || "No se pudo crear la solicitud.");
    } finally {
      setIsBusy(false);
    }
  }

  async function resolverSolicitud(event) {
    event.preventDefault();
    if (isBusy || !dialog?.permiso) return;

    const observacion = formRevision.observacion.trim();
    if (observacion.length > 500) {
      setError("La observación no puede superar los 500 caracteres.");
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      await resolverPermisoLaboral(dialog.permiso.PermisoId, {
        estado: formRevision.estado,
        observacion,
      });
      setDialog(null);
      setFormRevision(formRevisionVacio);
      setReloadKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.message || "No se pudo resolver la solicitud.");
    } finally {
      setIsBusy(false);
    }
  }

  function abrirRevision(permiso) {
    setError(null);
    setFormRevision(formRevisionVacio);
    setDialog({ tipo: "resolver", permiso });
  }

  function cerrarDialog() {
    if (isBusy) return;
    setError(null);
    setDialog(null);
  }

  const permisoSeleccionado = dialog?.permiso;
  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Inicio</Link> / <span>Permisos laborales</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">
            {esColaborador
              ? "MIS SOLICITUDES"
              : esGerente
                ? "MI RESTAURANTE"
                : "ADMINISTRACIÓN"}
          </p>
          <h1>Permisos laborales</h1>
          <p>
            {esColaborador
              ? "Solicitá permisos laborales y consultá su estado."
              : "Consultá y revisá las solicitudes de permisos laborales."}
          </p>
        </div>
        <Link className="button button-secondary" to="/inicio">
          <ArrowLeft size={17} aria-hidden="true" /> Volver al inicio
        </Link>
      </div>

      {esColaborador && (
        <div className="solicitudes-actions">
          <button
            type="button"
            className="button button-primary solicitudes-create-button"
            aria-haspopup="dialog"
            onClick={() => {
              setError(null);
              setFormSolicitud(formSolicitudVacio);
              setDialog({ tipo: "crear" });
            }}
          >
            <PlusIcon size={18} aria-hidden="true" />
            <span>Nueva solicitud</span>
          </button>
        </div>
      )}

      <AlertMessage>{error || errorPermisos}</AlertMessage>

      <SolicitudesFiltros
        filtros={filters}
        onAplicar={setFilters}
        solicitudes={permisos}
        isLoading={isLoading}
        error={errorPermisos}
        puedeConsultar={puedeConsultar}
        mostrarRestaurante={puedeElegirRestaurante}
        restaurantes={restaurantes}
        cargandoRestaurantes={cargandoRestaurantes}
        errorRestaurantes={errorRestaurantes}
        etiquetaFecha="Fecha solicitada desde"
        ariaLabel="Filtros de permisos laborales"
      />

      <section
        className="data-panel"
        aria-label="Listado de permisos laborales"
      >
        {!puedeConsultar ? (
          <p className="catalog-message">
            Seleccioná un restaurante y aplicá los filtros.
          </p>
        ) : isLoading ? (
          <LoadingState entidad="permisos laborales" />
        ) : errorPermisos ? (
          <p className="catalog-message">
            No se pudieron cargar los permisos laborales.
          </p>
        ) : permisos.length === 0 ? (
          <p className="catalog-message">
            No hay permisos laborales para estos filtros.
          </p>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Listado de permisos"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Solicitud</th>
                  {!esColaborador && <th scope="col">Colaborador</th>}
                  <th scope="col">Fecha solicitada</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {permisos.map((permiso) => {
                  const puedeResolverEste =
                    esGerente &&
                    permiso.Estado === "PENDIENTE" &&
                    String(permiso.FechaSolicitada).slice(0, 10) > fechaHoy;
                    
                  return (
                    <tr key={permiso.PermisoId}>
                      <td>#{permiso.PermisoId}</td>
                      {!esColaborador && <td>{nombreColaborador(permiso)}</td>}
                      <td>{formatDate(permiso.FechaSolicitada)}</td>
                      <td>
                        <span
                          className="solicitud-state"
                          data-estado={permiso.Estado}
                        >
                          {estadosLabel[permiso.Estado] ?? permiso.Estado}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="table-action-button"
                            aria-haspopup="dialog"
                            onClick={() => {
                              setError(null);
                              setDialog({ tipo: "detalle", permiso });
                            }}
                          >
                            Ver detalle
                          </button>
                          {puedeResolverEste && (
                            <button
                              type="button"
                              className="table-action-button"
                              aria-haspopup="dialog"
                              onClick={() => abrirRevision(permiso)}
                            >
                              Revisar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog && (
        <Dialog
          titulo={
            dialog.tipo === "crear"
              ? "Nueva solicitud de permiso"
              : dialog.tipo === "resolver"
                ? "Revisar permiso laboral"
                : "Detalle del permiso laboral"
          }
          subtitulo={
            permisoSeleccionado
              ? `Solicitud #${permisoSeleccionado.PermisoId} · ${nombreRestaurante(permisoSeleccionado)}`
              : undefined
          }
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          {dialog.tipo === "crear" && (
            <form className="solicitud-create-form" onSubmit={crearSolicitud}>
              <fieldset disabled={isBusy} aria-busy={isBusy}>
                <label htmlFor="permiso-fecha">
                  Fecha del permiso
                  <input
                    id="permiso-fecha"
                    type="date"
                    required
                    autoFocus
                    min={fechaMinimaSolicitud}
                    value={formSolicitud.fechaSolicitada}
                    onChange={(event) =>
                      setFormSolicitud((current) => ({
                        ...current,
                        fechaSolicitada: event.target.value,
                      }))
                    }
                  />
                </label>
                <label htmlFor="permiso-motivo">
                  Motivo
                  <textarea
                    id="permiso-motivo"
                    required
                    rows={4}
                    maxLength={500}
                    placeholder="Explicá brevemente el motivo del permiso."
                    value={formSolicitud.motivo}
                    onChange={(event) =>
                      setFormSolicitud((current) => ({
                        ...current,
                        motivo: event.target.value,
                      }))
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

          {permisoSeleccionado && (
            <div className="solicitud-summary">
              <span
                className="solicitud-state"
                data-estado={permisoSeleccionado.Estado}
              >
                {estadosLabel[permisoSeleccionado.Estado] ??
                  permisoSeleccionado.Estado}
              </span>
              <dl className="solicitud-details">
                {!esColaborador && (
                  <div>
                    <dt>Colaborador</dt>
                    <dd>{nombreColaborador(permisoSeleccionado)}</dd>
                  </div>
                )}
                <div>
                  <dt>Fecha solicitada</dt>
                  <dd>{formatDate(permisoSeleccionado.FechaSolicitada)}</dd>
                </div>
                {!esColaborador && (
                  <div>
                    <dt>Restaurante</dt>
                    <dd>{nombreRestaurante(permisoSeleccionado)}</dd>
                  </div>
                )}
                <div className="solicitud-details-wide">
                  <dt>Motivo</dt>
                  <dd>
                    {permisoSeleccionado.Motivo || "Sin motivo registrado."}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {dialog.tipo === "detalle" && permisoSeleccionado && (
            <>
              {permisoSeleccionado.Estado !== "PENDIENTE" && (
                <dl className="solicitud-review-details">
                  <div>
                    <dt>Revisado por</dt>
                    <dd>
                      {permisoSeleccionado.RevisadoPorUsuarioId
                        ? `Usuario #${permisoSeleccionado.RevisadoPorUsuarioId}`
                        : "Sin información registrada"}
                    </dd>
                  </div>
                  <div>
                    <dt>Observación</dt>
                    <dd>
                      {permisoSeleccionado.Observacion || "Sin observación."}
                    </dd>
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

          {dialog.tipo === "resolver" && permisoSeleccionado && (
            <form
              className="solicitud-create-form solicitud-resolution"
              onSubmit={resolverSolicitud}
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
                        name="permiso-resolucion"
                        value={valor}
                        checked={formRevision.estado === valor}
                        onChange={() => {
                          setFormRevision((current) => ({
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
                <p className="solicitud-create-note">
                  {formRevision.estado === "APROBADA"
                    ? "El permiso quedará aprobado para la fecha indicada."
                    : "El permiso quedará rechazado."}
                </p>
                <label htmlFor="permiso-observacion">
                  Observación (opcional)
                  <textarea
                    id="permiso-observacion"
                    rows={3}
                    maxLength={500}
                    placeholder="Agregá una observación para el colaborador."
                    value={formRevision.observacion}
                    onChange={(event) =>
                      setFormRevision((current) => ({
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
                    Cancelar
                  </button>
                  <button type="submit" className="button button-primary">
                    {isBusy
                      ? "Guardando..."
                      : formRevision.estado === "APROBADA"
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
