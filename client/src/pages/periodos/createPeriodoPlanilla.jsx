import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { createPeriodo } from "../../services/periodos.Service.js";
import { notifySuccess } from "../../utils/notifications.js";

const emptyForm = {
  fechaInicio: "",
  fechaFin: "",
  fechaPago: "",
  fechaLimiteAjustes: "",
};

function followingDay(value) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function CreatePeriodoPlanilla() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(user?.Rol);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await createPeriodo(form);
      notifySuccess("Periodo creado correctamente.");
      navigate("/periodos");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/periodos">Periodos de planilla</Link> / <span>Crear periodo</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Crear periodo</h1>
          <p>Define el rango de planilla, el plazo de ajustes y la fecha de pago.</p>
        </div>
      </div>

      {!canManage ? (
        <AlertMessage title="Acceso restringido">
          Solo Recursos Humanos y Administración pueden crear periodos.
        </AlertMessage>
      ) : (
        <>
          {error && <AlertMessage title="No se pudo crear el periodo">{error}</AlertMessage>}
          <form className="catalog-form data-panel period-create-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Fecha de inicio
                <input
                  type="date"
                  required
                  value={form.fechaInicio}
                  onChange={(event) => setForm({ ...form, fechaInicio: event.target.value })}
                />
              </label>
              
              <label>
                Fecha de fin
                <input
                  type="date"
                  required
                  min={form.fechaInicio || undefined}
                  value={form.fechaFin}
                  onChange={(event) => setForm({ ...form, fechaFin: event.target.value })}
                />
              </label>

              <label>
                Fecha límite de ajustes
                <input
                  type="date"
                  required
                  min={form.fechaFin || undefined}
                  value={form.fechaLimiteAjustes}
                  onChange={(event) => setForm({ ...form, fechaLimiteAjustes: event.target.value })}
                />
              </label>

              <label>
                Fecha de pago
                <input
                  type="date"
                  required
                  min={followingDay(form.fechaLimiteAjustes) || followingDay(form.fechaFin)}
                  value={form.fechaPago}
                  onChange={(event) => setForm({ ...form, fechaPago: event.target.value })}
                />
              </label>

              <div className="table-actions">
                <button className="button button-primary" type="submit">
                  <CalendarPlus size={17} /> {busy ? "Creando..." : "Crear periodo"}
                </button>
                
                <Link className="button button-secondary" to="/periodos">
                  <ArrowLeft size={17} /> Cancelar
                </Link>
              </div>
            </fieldset>
          </form>
        </>
      )}
    </>
  );
}