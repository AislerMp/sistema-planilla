import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Edit, Power, PowerOff, SearchX } from "lucide-react";
import SearchBar from "../../components/searchBar.jsx";

import { useAuth } from "../../context/AuthContext.jsx";

import { useUsers } from "../../hooks/useUsers.js";
import { activateUser, deactivateUser } from "../../services/auth.Service.js";

export default function UsuariosDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [actionId, setActionId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const isAdmin = user?.Rol === "ADMINISTRADOR";

  const { users, isLoading, error } = useUsers([reloadKey]);

  const filteredUsers = users.filter((usuario) => {
    const normalizedSearch = search.trim().toLowerCase();
    return usuario.NombreUsuario.toLowerCase().includes(normalizedSearch);
  });

  function handleEdit(usuarioId) {
    navigate(`/usuarios/${usuarioId}/editar`);
  }

  async function handleActivate(usuarioId) {
    if (actionId !== null) return;

    try {
      setActionId(usuarioId);
      setActionError(null);

      await activateUser(usuarioId);

      setReloadKey((currentKey) => currentKey + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setActionId(null);
    }
  }

  async function handleDeactivate(usuarioId) {
    if (actionId !== null) return;
    try {
      setActionId(usuarioId);
      setActionError(null);

      await deactivateUser(usuarioId);
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
        <span>Usuarios</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">PERSONAS Y EQUIPO</p>
          <h1>Usuarios</h1>
          <p>Un espacio para las cuentas y sus perfiles de acceso.</p>
        </div>

        {isAdmin && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate("/usuarios/registrar")}
          >
            Registrar usuario
          </button>
        )}
      </div>

      <section className="data-panel" aria-label="Listado de usuarios">
          <div className="table-toolbar">
            <SearchBar
              search={search}
              setSearch={setSearch}
              entidad="usuarios"
              id="usuarios-search"
              placeholder="Buscar por nombre o identificación..."
            />
          </div>

          {isLoading && (
            <div className="loading-state" role="status">
              <span className="loading-mark" aria-hidden="true" />
              <p>Cargando usuarios...</p>
            </div>
          )}

          {(error || actionError) && (
            <p className="error-message" role="alert">
              {actionError ?? error}
            </p>
          )}

          {!isLoading && !error && (
            <>
              <p className="mobile-table-hint">
                Deslizá la tabla para ver todas las columnas →
              </p>

              <div
                className="table-scroll"
                role="region"
                aria-label="Tabla de usuarios"
                tabIndex={0}
              >
                <table>
                  <caption className="sr-only">
                    Usuarios registrados en el sistema
                  </caption>

                  <thead>
                    <tr>
                      <th scope="col">Usuario</th>
                      <th scope="col">Rol</th>
                      <th scope="col">Fecha de Ingreso</th>
                      <th scope="col">Estado</th>
                      {isAdmin && <th scope="col">Acciones</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((usuario) => {
                      const isProcessing =
                        actionId === usuario.UsuarioId;

                      return (
                        <tr key={usuario.UsuarioId}>
                          <td>
                            <div className="name-cell">
                              <span className="avatar table-avatar">
                                {getInitials(
                                  usuario.NombreUsuario,
                                  usuario.UsuarioId,
                                )}
                              </span>

                              <strong>
                                {usuario.NombreUsuario}
                              </strong>
                            </div>
                          </td>

                          <td>
                            {formatRole(usuario.Rol) ??
                              `Rol #${usuario.RolId}`}
                          </td>

                          <td>
                            {formatDate(usuario.FechaCreacion)}
                          </td>

                          <td>
                            <span
                              className={
                                usuario.Activo
                                  ? "status-badge status-badge--active"
                                  : "status-badge status-badge--inactive"
                              }
                            >
                              <span />

                              {usuario.Activo ? "Activo" : "Inactivo"}
                            </span>
                          </td>

                          {isAdmin && (
                            <td>
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="table-action-button"
                                  disabled={isProcessing || !usuario.Activo}
                                  title={!usuario.Activo ? "Activá el usuario antes de actualizarlo" : undefined}
                                  onClick={() =>
                                    handleEdit(usuario.UsuarioId)
                                  }
                                >
                                  <Edit size={16} />
                                  Actualizar
                                </button>

                                {usuario.Activo ? (
                                  <button
                                    type="button"
                                    className="table-action-button table-action-button--danger"
                                    disabled={isProcessing}
                                    onClick={() =>
                                      handleDeactivate(
                                        usuario.UsuarioId,
                                      )
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
                                      handleActivate(usuario.UsuarioId)
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

              {filteredUsers.length === 0 && (
                <div className="empty-state" role="status">
                  <SearchX size={32} />

                  <h2>No encontramos usuarios</h2>

                  <p>Probá con otro nombre de usuario.</p>

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
                  {filteredUsers.length} de {users.length}{" "}
                  registros
                </span>
              </div>
            </>
          )}
      </section>
    </>
  );
}

function getInitials(nombreUsuario = "") {
  return nombreUsuario
    .split(/[._\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function formatRole(role) {
  if (!role) return null;

  return role
    .toLocaleLowerCase("es")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("es"));
}
    
function formatDate(dateValue) {
  if (!dateValue) return "—";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
