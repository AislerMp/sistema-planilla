import { useState } from "react";
import LoadingState from "../../components/loadingState.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import { notifySuccess } from "../../utils/notifications.js";
import { Link, useNavigate } from "react-router-dom";
import { Edit, Power, PowerOff, SearchX } from "lucide-react";
import SearchBar from "../../components/searchBar.jsx";

import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";

import {
  getColaboradores,
  activateColaborador,
  deactivateColaborador,
} from "../../services/colaboradores.Service.js";

export default function ColaboradoresDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [reloadKey, setReloadKey] = useState(0);
  const [actionId, setActionId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const {
    data: colaboradores,
    isLoading,
    error,
  } = useAsyncRequest(getColaboradores, [reloadKey]);

  // Al principio useAsyncRequest devuelve null.
  const colaboradoresList = colaboradores ?? [];

  const filteredColaboradores = colaboradoresList.filter((colaborador) => {
    const fullName =
      `${colaborador.Nombres ?? ""} ${colaborador.Apellidos ?? ""}`.toLowerCase();

    const identification = String(
      colaborador.Identificacion ?? "",
    ).toLowerCase();

    const restaurante = String(
      colaborador.NombreRestaurante ?? "",
    ).toLowerCase();

    const normalizedSearch = search.trim().toLowerCase();

    return (
      (fullName.includes(normalizedSearch) ||
        identification.includes(normalizedSearch) ||
        restaurante.includes(normalizedSearch)) &&
      (status === "todos" ||
        Boolean(colaborador.Activo) === (status === "activos"))
    );
  });

  const isAdministrator = user?.Rol === "ADMINISTRADOR";

  function handleEdit(colaboradorId) {
    navigate(`/colaboradores/${colaboradorId}/editar`);
  }

  async function handleActivate(colaboradorId) {
    if (actionId !== null) return;

    try {
      setActionId(colaboradorId);
      setActionError(null);

      await activateColaborador(colaboradorId);
      notifySuccess("Colaborador activado correctamente.");

      // Provoca que useAsyncRequest consulte nuevamente los datos.
      setReloadKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionId(null);
    }
  }

  async function handleDeactivate(colaboradorId) {
    if (actionId !== null) return;

    try {
      setActionId(colaboradorId);
      setActionError(null);

      await deactivateColaborador(colaboradorId);
      notifySuccess("Colaborador desactivado correctamente.");

      setReloadKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link>
        {" / "}
        <span>Colaboradores</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">PERSONAS Y EQUIPO</p>
          <h1>Colaboradores</h1>
          <p>
            {user?.Rol === "GERENTE"
              ? "Consultá los colaboradores de tu restaurante asignado."
              : "Consultá y administrá la información de los colaboradores."}
          </p>
        </div>

        {isAdministrator && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate("/colaboradores/registrar")}
          >
            Registrar colaborador
          </button>
        )}
      </div>

      <section className="data-panel" aria-label="Listado de colaboradores">
        <div className="table-toolbar">
          <SearchBar
            search={search}
            setSearch={setSearch}
            entidad="colaboradores"
            id="colaborador-search"
            placeholder="Buscar por nombre o identificación o restaurante..."
          />

          <div className="status-filter">
            <label htmlFor="estado">Estado</label>
            <select
              id="estado"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
        </div>

        {isLoading && (
          <LoadingState entidad="colaboradores" />
        )}

        {(error || actionError) && (
          <AlertMessage>
            {actionError ?? error}
          </AlertMessage>
        )}

        {!isLoading && !error && (
          <>
            <p className="mobile-table-hint">
              Deslizá la tabla para ver todas las columnas →
            </p>

            <div
              className="table-scroll"
              role="region"
              aria-label="Tabla de colaboradores"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Colaboradores registrados en el sistema
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Colaborador</th>
                    <th scope="col">Identificación</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Puesto</th>
                    <th scope="col">Restaurante</th>
                    <th scope="col">Estado</th>

                    {isAdministrator && <th scope="col">Acciones</th>}
                  </tr>
                </thead>

                <tbody>
                  {filteredColaboradores.map((colaborador) => {
                    const isProcessing = actionId === colaborador.ColaboradorId;

                    return (
                      <tr key={colaborador.ColaboradorId}>
                        <td>
                          <div className="name-cell">
                            <span className="avatar table-avatar">
                              {getInitials(
                                colaborador.Nombres,
                                colaborador.Apellidos,
                              )}
                            </span>

                            <strong>
                              {colaborador.Nombres} {colaborador.Apellidos}
                            </strong>
                          </div>
                        </td>

                        <td>{colaborador.Identificacion}</td>

                        <td>{colaborador.Correo}</td>

                        <td>
                          {colaborador.NombrePuesto ?? "Sin puesto asignado"}
                        </td>

                        <td>
                          {colaborador.NombreRestaurante ??
                            "Sin restaurante asignado"}
                        </td>

                        <td>
                          <span
                            className={
                              colaborador.Activo
                                ? "status-badge status-badge--active"
                                : "status-badge status-badge--inactive"
                            }
                          >
                            <span />

                            {colaborador.Activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>

                        {isAdministrator && (
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="table-action-button"
                                disabled={isProcessing}
                                onClick={() =>
                                  handleEdit(colaborador.ColaboradorId)
                                }
                              >
                                <Edit size={16} />
                                Actualizar
                              </button>

                              {colaborador.Activo ? (
                                <button
                                  type="button"
                                  className="table-action-button table-action-button--danger"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    handleDeactivate(colaborador.ColaboradorId)
                                  }
                                >
                                  <PowerOff size={16} />

                                  {isProcessing
                                    ? "Desactivando..."
                                    : "Desactivar"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="table-action-button table-action-button--success"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    handleActivate(colaborador.ColaboradorId)
                                  }
                                >
                                  <Power size={16} />

                                  {isProcessing ? "Activando..." : "Activar"}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredColaboradores.length === 0 && (
              <div className="empty-state" role="status">
                <SearchX size={32} />

                <h2>No encontramos colaboradores</h2>

                <p>Probá con otro nombre o número de identificación.</p>

                {search && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setSearch("")}
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            )}

            <div className="table-footer">
              <span role="status">
                {filteredColaboradores.length} de {colaboradoresList.length}{" "}
                registros
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function getInitials(nombres = "", apellidos = "") {
  return `${nombres} ${apellidos}`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
