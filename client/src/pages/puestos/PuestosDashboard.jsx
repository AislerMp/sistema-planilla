import { useState } from "react";
import LoadingState from "../../components/loadingState.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import { Link } from "react-router-dom";
import { Edit, Power, PowerOff, Plus } from "lucide-react";
import SearchBar from "../../components/searchBar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import {
  getPuestos,
  createPuesto,
  updateTarifaPuesto,
  activatePuesto,
  deactivatePuesto,
} from "../../services/puestos.Service.js";

const emptyForm = { nombre: "", tarifaHora: "" };
const currency = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
});

export default function PuestosDashboard() {
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
    () => getPuestos("todos"),
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
        ? { nombre: row.Nombre, tarifaHora: row.TarifaHora ?? "" }
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
        tarifaHora: form.tarifaHora === "" ? null : form.tarifaHora,
      };
      if (editing) await updateTarifaPuesto(editing.PuestoId, payload);
      else await createPuesto(payload);
      setShowForm(false);
      setMessage("Puesto guardado correctamente.");
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
      await activatePuesto(id);
      setMessage("Puesto activado correctamente.");
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
      await deactivatePuesto(id);
      setMessage("Puesto desactivado correctamente.");
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
        <Link to="/inicio">Administración</Link> / <span>Puestos</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Puestos</h1>
          <p>Administrá los cargos y sus tarifas de pago por hora.</p>
        </div>
        {isAdmin && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => openForm()}
          >
            <Plus size={18} />
            Registrar puesto
          </button>
        )}
      </div>
      {actionError && (
        <AlertMessage title="No se pudo completar la acción">
          {actionError}
        </AlertMessage>
      )}
      {message && (
        <AlertMessage type="success" onClose={() => setMessage("")}>
          {message}
        </AlertMessage>
      )}
      {isAdmin && showForm && (
        <form className="catalog-form data-panel" onSubmit={save}>
          <h2>
            {editing ? "Actualizar tarifa" : "Registrar puesto"}
          </h2>
          <fieldset disabled={busy}>
            <label>
              Nombre
              <input
                required
                maxLength={80}
                value={form.nombre}
                disabled={Boolean(editing)}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>
            <label>
              Tarifa por hora (₡)
              <input
                type="number"
                min="0.01"
                max="9999999999.99"
                step="0.01"
                placeholder="Por definir"
                value={form.tarifaHora}
                onChange={(e) =>
                  setForm({ ...form, tarifaHora: e.target.value })
                }
              />
            </label>
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
      <section className="data-panel" aria-label="Listado de puestos">
        <div className="table-toolbar">
          <SearchBar
            search={search}
            setSearch={setSearch}
            entidad="puestos"
            id="puestos-search"
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
          <LoadingState entidad="puestos" />
        ) : error ? (
          <div className="catalog-message">
            <AlertMessage title="No se pudieron cargar los puestos">{error}</AlertMessage>
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
              aria-label="Tabla de puestos"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Tarifa por hora</th>
                    <th scope="col">Estado</th>
                    {isAdmin && <th scope="col">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.PuestoId}>
                      <td>
                        <strong>{row.Nombre}</strong>
                      </td>
                      <td>
                        {row.TarifaHora == null
                          ? "Por definir"
                          : currency.format(Number(row.TarifaHora))}
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
                              Actualizar tarifa
                            </button>
                            {row.Activo ? (
                              <button
                                className="table-action-button table-action-button--danger"
                                disabled={busy}
                                onClick={() => handleDeactivate(row.PuestoId)}
                              >
                                <PowerOff size={16} />
                                Desactivar
                              </button>
                            ) : (
                              <button
                                className="table-action-button table-action-button--success"
                                disabled={busy}
                                onClick={() => handleActivate(row.PuestoId)}
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
