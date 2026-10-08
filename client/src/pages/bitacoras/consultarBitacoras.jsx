import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { getBitacoras } from "../../services/bitacora.Service.js";
import { getUsers } from "../../services/auth.Service.js";

const emptyFilters = {
  usuarioId: "",
  entidad: "",
  accion: "",
  desde: "",
  hasta: "",
};

export default function ConsultarBitacoras() {
  const {
    data: usuarios,
    isLoading: cargandoUsuarios,
    error: errorUsuarios,
  } = useAsyncRequest(getUsers, []);

  const [form, setForm] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagina, setPagina] = useState(1);
  const [filterError, setFilterError] = useState("");

  const { data, isLoading, error } = useAsyncRequest(
    () => getBitacoras({ ...filters, pagina }),
    [filters, pagina],
  );

  const bitacoras = data ?? { registros: [] };
  
  const fechaHoraFormat = new Intl.DateTimeFormat("es-CR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  });

  function handleSubmit(event) {
    event.preventDefault();
    if (form.desde && form.hasta && form.desde > form.hasta) {
      setFilterError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    setFilterError("");
    setPagina(1);
    setFilters({ ...form });
  }

  // Pendiente: estados de filtros/página y consulta con getBitacoras.
  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Inicio</Link> / <span>Bitácoras</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Bitácoras</h1>
          <p>Consultá las acciones y los cambios realizados en el sistema.</p>
        </div>
        <Link className="button button-secondary" to="/inicio">
          <ArrowLeft size={17} /> Volver al inicio
        </Link>
      </div>

      <form
        className="catalog-form data-panel bitacoras-filters"
        onSubmit={handleSubmit}
        aria-labelledby="bitacoras-filtros"
      >
        <h2 id="bitacoras-filtros">Filtros de consulta</h2>
        <AlertMessage>{errorUsuarios}</AlertMessage>
        <fieldset>
            <label>
              Desde
              <input
                name="desde"
                type="date"
                value={form.desde}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, desde: event.target.value }))
                }
                max={form.hasta}
              />
            </label>
            <label>
              Hasta
              <input
                name="hasta"
                type="date"
                value={form.hasta}
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    hasta: event.target.value,
                  }));
                }}
                min={form.desde}
              />
            </label>
            <label>
              Usuario
              <select
                name="usuarioId"
                value={form.usuarioId}
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    usuarioId: event.target.value,
                  }));
                }}
                disabled={cargandoUsuarios || Boolean(errorUsuarios)}
              >
                <option value="">
                  {cargandoUsuarios
                    ? "Cargando usuarios..."
                    : "Todos los usuarios"}
                </option>
                {(usuarios ?? []).map((usuario) => (
                  <option key={usuario.UsuarioId} value={usuario.UsuarioId}>
                    {usuario.NombreUsuario}
                    {usuario.Activo ? "" : " (Inactivo)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Entidad
              <select
                name="entidad"
                value={form.entidad}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    entidad: e.target.value,
                  }));
                }}
              >
                <option value="">Todas las entidades</option>
                {[
                  "Restaurantes",
                  "Usuarios",
                  "Puestos",
                  "Colaboradores",
                  "PeriodosPlanilla",
                  "AsistenciasDiarias",
                  "HorasExtras",
                  "Solicitudes",
                  "SolicitudesHorasExtras",
                  "SolicitudesPermisosLaborales",
                ].map((entidad) => (
                  <option key={entidad} value={entidad}>
                    {entidad}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Acción
              <select
                name="accion"
                value={form.accion}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    accion: e.target.value,
                  }));
                }}
              >
                <option value="">Todas las acciones</option>
                {[
                  "CREAR",
                  "ACTUALIZAR",
                  "ACTIVAR",
                  "DESACTIVAR",
                  "CAMBIAR_TARIFA",
                  "CAMBIAR_CONTRASENA",
                  "CAMBIAR_ESTADO",
                  "AJUSTAR_HORAS",
                  "APROBAR_HORAS_EXTRA",
                  "RECHAZAR_HORAS_EXTRA",
                  "APROBAR_PERMISO_LABORAL",
                  "RECHAZAR_PERMISO_LABORAL",
                ].map((accion) => (
                  <option key={accion} value={accion}>
                    {accion.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="table-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={isLoading}
              >
                <Filter size={16} /> Aplicar filtros
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setForm({ ...emptyFilters });
                  setFilters({ ...emptyFilters });
                  setPagina(1);
                  setFilterError("");
                }}
              >
                <RotateCcw size={16} /> Limpiar filtros
              </button>
            </div>
            {filterError && (
              <AlertMessage title="Revisa el rango de fechas">
                {filterError}
              </AlertMessage>
            )}
        </fieldset>
      </form>

      <section
        className="data-panel bitacoras-results"
        aria-labelledby="bitacoras-listado"
      >
        <AlertMessage>{error}</AlertMessage>
        <div className="table-toolbar">
          <h2 id="bitacoras-listado">Historial de acciones</h2>
          <span className="bitacoras-results-count">
            {isLoading ? "Consultando..." : `${bitacoras.total ?? 0} registros`}
          </span>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="Listado de bitácoras"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Usuario</th>
                <th scope="col">Entidad</th>
                <th scope="col">Registro</th>
                <th scope="col">Acción</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="bitacoras-table-message">
                    <LoadingState entidad="bitácoras" compacto descripcion="" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="bitacoras-table-message">
                    No se pudieron cargar los registros.
                  </td>
                </tr>
              ) : (bitacoras.registros ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="bitacoras-table-message">
                    No hay bitácoras para mostrar.
                  </td>
                </tr>
              ) : (
                bitacoras.registros.map((registro) => (
                  <tr key={registro.BitacoraId}>
                    <td>
                      <time dateTime={registro.FechaEvento}>
                        {fechaHoraFormat.format(new Date(registro.FechaEvento))}
                      </time>
                    </td>
                    <td>{registro.NombreUsuario ?? "Usuario no disponible"}</td>
                    <td>{registro.Entidad}</td>
                    <td>{registro.RegistroId}</td>
                    <td>{registro.Accion?.replaceAll("_", " ")}</td>
                    <td>
                      <Link
                        className="table-action-button"
                        to={`/bitacoras/${registro.BitacoraId}`}
                      >
                        <Eye size={16} aria-hidden="true" />
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span className="bitacoras-page-status" aria-live="polite">
            Página <strong>{pagina}</strong> de{" "}
            <strong>{bitacoras?.totalPaginas ?? 0}</strong>
          </span>
          <div className="table-actions bitacoras-pagination">
            <button
              type="button"
              className="button button-secondary"
              disabled={isLoading || pagina <= 1}
              onClick={() => setPagina((prevPagina) => prevPagina - 1)}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={isLoading || pagina >= (bitacoras.totalPaginas ?? 0)}
              onClick={() => setPagina((prevPagina) => prevPagina + 1)}
            >
              <ChevronRight size={16} />
              Siguiente
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
