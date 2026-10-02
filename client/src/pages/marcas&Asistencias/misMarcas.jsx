import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Filter, RotateCcw } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { getMisMarcas, getMarcasColaborador } from "../../services/marcas.Service.js";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";

const emptyFilters = { desde: "", hasta: "" };

const dateFormat = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const dateTimeFormat = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

function formatDate(value) {
  return dateFormat.format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

export default function MisMarcas() {
  const { user } = useAuth();
  const { colaboradorId } = useParams();
  const location = useLocation();
  const canConsult = colaboradorId
    ? ["GERENTE", "ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(user?.Rol)
    : user?.Rol === "COLABORADOR";
  const titulo = colaboradorId ? "Marcas del colaborador" : "Mis marcas";

  const [form, setForm] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [filterError, setFilterError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const { data, isLoading, error } = useAsyncRequest(
    () => !canConsult ? Promise.resolve([]) : colaboradorId
      ? getMarcasColaborador(colaboradorId, filters)
      : getMisMarcas(filters),
    [filters, reloadKey, colaboradorId, canConsult],
  );

  const marcas = data ?? [];
  const hasFilters = Boolean(filters.desde || filters.hasta);

  function handleFiltros(event) {
    event.preventDefault();
    if (isLoading) return;
    if (form.desde && form.hasta && form.desde > form.hasta) {
      setFilterError("La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }
    setFilterError("");
    setFilters({ ...form });
  }

  function clearFilters() {
    setForm(emptyFilters);
    setFilters({ ...emptyFilters });
    setFilterError("");
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/asistencia">Marcas y asistencias</Link> /{" "}
        <span>{titulo}</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">{colaboradorId ? `COLABORADOR #${colaboradorId}` : "MI JORNADA"}</p>
          <h1>{titulo}</h1>
          {colaboradorId && location.state?.nombre && <p>{location.state.nombre}</p>}
          <p>
            Consulta el historial de entradas y salidas, de la más reciente a la
            más antigua.
          </p>
        </div>
        <Link className="button button-secondary" to={colaboradorId ? "/asistencia/gestionar" : "/asistencia"}>
          <ArrowLeft size={17} aria-hidden="true" /> {colaboradorId ? "Volver a asistencias" : "Volver al menú"}
        </Link>
      </div>

      {!canConsult ? (
        <AlertMessage title="Acceso restringido">
          No tenés permiso para acceder a esta consulta.
        </AlertMessage>
      ) : (
        <>
          <form
            className="catalog-form data-panel"
            onSubmit={handleFiltros}
            aria-labelledby="marks-filters-title"
          >
            <h2 id="marks-filters-title">Filtrar por fecha</h2>
            <fieldset disabled={isLoading} aria-label="Rango de fechas">
              <label htmlFor="marks-desde">
                Desde
                <input
                  id="marks-desde"
                  name="desde"
                  type="date"
                  value={form.desde}
                  max={form.hasta || undefined}
                  onChange={(event) => {
                    setForm({ ...form, desde: event.target.value });
                    setFilterError("");
                  }}
                />
              </label>
              <label htmlFor="marks-hasta">
                Hasta
                <input
                  id="marks-hasta"
                  name="hasta"
                  type="date"
                  value={form.hasta}
                  min={form.desde || undefined}
                  onChange={(event) => {
                    setForm({ ...form, hasta: event.target.value });
                    setFilterError("");
                  }}
                />
              </label>
              <p className="muted">
                Ambas fechas son opcionales. El filtro incluye el día inicial y
                final de la jornada asignada.
              </p>
              {filterError && (
                <AlertMessage title="Revisa las fechas">
                  {filterError}
                </AlertMessage>
              )}
              <div className="table-actions">
                <button type="submit" className="button button-primary">
                  <Filter size={17} aria-hidden="true" /> Aplicar filtros
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={clearFilters}
                >
                  <RotateCcw size={17} aria-hidden="true" /> Limpiar filtros
                </button>
              </div>
            </fieldset>
          </form>

          <section
            className="data-panel"
            aria-label="Historial de marcas"
            aria-busy={isLoading}
          >
            <div className="table-toolbar">
              <div>
                <h2>Historial de marcas</h2>
                <p className="muted">
                  {hasFilters
                    ? `Desde ${filters.desde ? formatDate(filters.desde) : "el inicio"} hasta ${filters.hasta ? formatDate(filters.hasta) : "la última marca"}.`
                    : "Mostrando todo el historial disponible."}
                </p>
                <p className="table-hint">
                  Entradas y salidas en hora de Costa Rica.
                </p>
              </div>
            </div>
            {isLoading ? (
              <LoadingState entidad="marcas" />
            ) : error ? (
              <div className="catalog-message">
                <AlertMessage title="No se pudieron cargar las marcas">
                  {error}
                </AlertMessage>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  <RotateCcw size={17} aria-hidden="true" /> Reintentar
                </button>
              </div>
            ) : marcas.length === 0 ? (
              <div className="empty-state">
                <h2>
                  {hasFilters
                    ? "Sin marcas en este rango"
                    : "No hay marcas disponibles"}
                </h2>
                <p>
                  {hasFilters
                    ? "Prueba otras fechas o limpia los filtros para ver todo el historial."
                    : "Las entradas y salidas aparecerán aquí cuando se registren."}
                </p>
              </div>
            ) : (
              <>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Tabla de marcas"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Fecha asignada</th>
                        <th scope="col">Intervalo</th>
                        <th scope="col">Entrada</th>
                        <th scope="col">Salida</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marcas.map((marca) => (
                        <tr key={marca.MarcaId}>
                          <td>{formatDate(marca.FechaAsignada)}</td>
                          <td>{marca.NumeroIntervalo}</td>
                          <td>
                            {dateTimeFormat.format(
                              new Date(marca.FechaHoraEntrada),
                            )}
                          </td>
                          <td>
                            {marca.FechaHoraSalida
                              ? dateTimeFormat.format(
                                  new Date(marca.FechaHoraSalida),
                                )
                              : "Pendiente"}
                          </td>
                          <td>
                            <span
                              className={`status-badge status-badge--${marca.FechaHoraSalida ? "active" : "inactive"}`}
                            >
                              <span aria-hidden="true" />
                              {marca.FechaHoraSalida
                                ? "Completada"
                                : "Sin salida"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer" role="status">
                  <span>
                    {marcas.length} {marcas.length === 1 ? "marca" : "marcas"}
                  </span>
                  <span>Más recientes primero</span>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
