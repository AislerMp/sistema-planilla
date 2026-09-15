import { useState } from "react";
import { Link } from "react-router-dom";
import { Edit, Power, PowerOff, Plus } from "lucide-react";
import SearchBar from "../../components/searchBar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import {
  getRestaurantes,
  createRestaurante,
  updateRestaurante,
  activateRestaurante,
  deactivateRestaurante,
} from "../../services/restaurantes.Service.js";
import DireccionFields from "../../components/DireccionFields.jsx";

const emptyForm = { nombre: "", distritoId: "", detalleDireccion: "" };

export default function RestaurantesDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.Rol === "ADMINISTRADOR";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, error } = useAsyncRequest(
    () => getRestaurantes("todos"),
    [reloadKey],
  );
  const records = data ?? [];
  const rows = records.filter(
    (row) =>
      row.Nombre.toLocaleLowerCase("es").includes(
        search.trim().toLocaleLowerCase("es"),
      ) &&
      (status === "todos" || Boolean(row.Activo) === (status === "activos")),
  );

  function openForm(row = null) {
    setEditing(row);
    setForm(
      row
        ? {
            nombre: row.Nombre,
            distritoId: row.DistritoId ?? "",
            detalleDireccion: row.DetalleDireccion ?? "",
          }
        : { ...emptyForm },
    );
    setActionError(null);
    setMessage("");
    setShowForm(true);
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setMessage("");
    try {
      const payload = {
        nombre: form.nombre.trim(),
        distritoId: form.distritoId === "" ? null : Number(form.distritoId),
        detalleDireccion: form.detalleDireccion.trim() || null,
      };
      if (editing) await updateRestaurante(editing.RestauranteId, payload);
      else await createRestaurante(payload);
      setShowForm(false);
      setMessage("Restaurante guardado correctamente.");
      setReloadKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(id) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setMessage("");
    try {
      await activateRestaurante(id);
      setMessage("Restaurante activado correctamente.");
      setReloadKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate(id) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    setMessage("");
    try {
      await deactivateRestaurante(id);
      setMessage("Restaurante desactivado correctamente.");
      setReloadKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> / <span>Restaurantes</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Restaurantes</h1>
          <p>Administrá los restaurantes y sus direcciones.</p>
        </div>
        {isAdmin && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => openForm()}
          >
            <Plus size={18} />
            Registrar restaurante
          </button>
        )}
      </div>
      {actionError && (
        <p className="catalog-message" role="alert">
          {actionError}
        </p>
      )}
      {message && (
        <p className="catalog-message" role="status">
          {message}
        </p>
      )}
      {isAdmin && showForm && (
        <form className="catalog-form data-panel" onSubmit={save}>
          <h2>
            {editing ? "Actualizar restaurante" : "Registrar restaurante"}
          </h2>
          <fieldset disabled={busy}>
            <label>
              Nombre
              <input
                required
                maxLength={100}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
            <DireccionFields
              key={editing?.RestauranteId ?? "nuevo"}
              form={form}
              setForm={setForm}
              initialDistritoId={editing?.DistritoId}
            />
            <div className="table-actions">
              <button className="button button-primary" type="submit">
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <section className="data-panel" aria-label="Listado de restaurantes">
        <div className="table-toolbar">
          <SearchBar
            search={search}
            setSearch={setSearch}
            entidad="restaurantes"
            id="restaurantes-search"
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
        {isLoading || (!data && !error) ? (
          <p className="catalog-message" role="status">
            Cargando restaurantes...
          </p>
        ) : error ? (
          <div className="catalog-message">
            <p role="alert">{error}</p>
            <button
              className="button button-secondary"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div
              className="table-scroll"
              role="region"
              aria-label="Tabla de restaurantes"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Dirección</th>
                    <th scope="col">Estado</th>
                    {isAdmin && <th scope="col">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.RestauranteId}>
                      <td>
                        <strong>{row.Nombre}</strong>
                      </td>
                      <td>
                        {row.DetalleDireccion || "Sin dirección registrada"}
                      </td>
                      <td>
                        <span
                          className={
                            "status-badge " +
                            (row.Activo
                              ? "status-badge--active"
                              : "status-badge--inactive")
                          }
                        >
                          <span />
                          {row.Activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="table-actions">
                            <button
                              className="table-action-button"
                              disabled={busy || !row.Activo}
                              onClick={() => openForm(row)}
                            >
                              <Edit size={16} />
                              Actualizar
                            </button>
                            {row.Activo ? (
                              <button
                                className="table-action-button table-action-button--danger"
                                disabled={busy}
                                onClick={() =>
                                  handleDeactivate(row.RestauranteId)
                                }
                              >
                                <PowerOff size={16} />
                                Desactivar
                              </button>
                            ) : (
                              <button
                                className="table-action-button table-action-button--success"
                                disabled={busy}
                                onClick={() =>
                                  handleActivate(row.RestauranteId)
                                }
                              >
                                <Power size={16} />
                                Activar
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <div className="empty-state">
                <h2>No hay coincidencias</h2>
                <p>Revisá la búsqueda o el filtro de estado.</p>
              </div>
            )}
            <div className="table-footer">
              <span role="status">
                {rows.length} de {records.length} registros
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}
