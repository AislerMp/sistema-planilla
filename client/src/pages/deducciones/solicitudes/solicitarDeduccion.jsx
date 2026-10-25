import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  ReceiptText,
} from "lucide-react";
import {
  solicitarDeduccion,
  getDeducciones,
} from "../../../services/deducciones.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import { useState } from "react";
import AlertMessage from "../../../components/AlertMessage.jsx";
import { notifySuccess } from "../../../utils/notifications.js";
import LoadingState from "../../../components/loadingState.jsx";
import { obtenerFechaHoyCostaRica } from "../../../utils/fechaUtils.js";

const emptyForm = {
  deduccionId: null,
  porcentajeSolicitado: "",
  fechaInicio: null,
  fechaFin: null,
  motivo: "",
};

export default function SolicitarDeduccion() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hoy = obtenerFechaHoyCostaRica();
  const inicio = form.fechaInicio?.slice(0, 10);

  const {
    data,
    isLoading,
    error: deduccionesError,
  } = useAsyncRequest(() => getDeducciones({ fechaVigencia: hoy }));

  const deducciones = (data ?? []).filter(
    (deduccion) => deduccion.TipoDeduccion === "ADICIONAL",
  );
  
  const minimoFin = inicio || hoy;

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "porcentajeSolicitado" && value !== "") {
      const n = Number(value);
      if (!Number.isFinite(n) || n > 20) return;
    }

    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!form.deduccionId || !form.fechaInicio) {
      setError("Seleccioná un concepto y la fecha de inicio.");
      return;
    }

    const porcentaje = Number(form.porcentajeSolicitado);
    if (!form.porcentajeSolicitado || porcentaje < 1 || porcentaje > 20) {
      setError("El porcentaje solicitado debe estar entre 1 y 20.");
      return;
    }

    if (form.fechaFin && form.fechaInicio > form.fechaFin) {
      setError("La fecha de inicio no puede ser mayor que la fecha de fin.");
      return;
    }

    setLoading(true);
    try {
      await solicitarDeduccion({
        deduccionId: Number(form.deduccionId),
        porcentajeSolicitado: porcentaje,
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin || null,
        motivo: form.motivo.trim() || null,
      });
      setForm(emptyForm);
      notifySuccess("Solicitud de deducción enviada correctamente.");
      navigate("/solicitudes-deducciones");
    } catch (error) {
      setError(error.message || "Ocurrió un error al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="deduccion-solicitudes-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/solicitudes-deducciones">Solicitudes de deducciones</Link> /{" "}
        <span>Nueva solicitud</span>
      </div>

      <Link className="deducciones-volver" to="/solicitudes-deducciones">
        <ArrowLeft size={17} aria-hidden="true" /> Volver a mis solicitudes
      </Link>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">NUEVA SOLICITUD</p>
          <h1>Solicitar deducción</h1>
          <p>Indicá el concepto adicional y desde cuándo querés aplicarlo.</p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState entidad="conceptos de deducción" />
      ) : (
        <div className="deduccion-solicitudes-layout">
          <section
            className="data-panel deduccion-solicitudes-card"
            aria-labelledby="deduccion-form-titulo"
          >
            <AlertMessage title="No se pudieron cargar los conceptos">
              {deduccionesError}
            </AlertMessage>
            <div className="deduccion-solicitudes-card-heading">
              <ReceiptText size={20} aria-hidden="true" />
              <div>
                <h2 id="deduccion-form-titulo">Datos de la solicitud</h2>
                <p>Completá los campos para preparar tu solicitud.</p>
              </div>
            </div>

            <form
              className="solicitud-create-form deduccion-solicitudes-form"
              onSubmit={handleSubmit}
            >
              <AlertMessage title="No se pudo enviar la solicitud">
                {error}
              </AlertMessage>
              <fieldset disabled={loading || !!deduccionesError}>
                <div className="deduccion-solicitudes-field-grid">
                  <label htmlFor="deduccion-concepto">
                    Concepto adicional
                    <select
                      id="deduccion-concepto"
                      name="deduccionId"
                      value={form.deduccionId || ""}
                      onChange={handleChange}
                    >
                      <option value="">Seleccioná un concepto</option>
                      {deducciones.map((deduccion) => (
                        <option
                          key={deduccion.DeduccionId}
                          value={deduccion.DeduccionId}
                        >
                          {deduccion.Nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="deduccion-porcentaje">
                    Porcentaje solicitado (%)
                    <input
                      id="deduccion-porcentaje"
                      name="porcentajeSolicitado"
                      type="number"
                      min="1"
                      max="20"
                      step="0.5"
                      placeholder="Ej. 5,00"
                      value={form.porcentajeSolicitado}
                      onChange={handleChange}
                    />
                  </label>
                  <label htmlFor="deduccion-fecha-inicio">
                    Inicio de aplicación
                    <input
                      id="deduccion-fecha-inicio"
                      name="fechaInicio"
                      type="date"
                      min={hoy}
                      value={form.fechaInicio || ""}
                      onChange={handleChange}
                    />
                  </label>
                  <label htmlFor="deduccion-fecha-fin">
                    Fin de aplicación (opcional)
                    <input
                      id="deduccion-fecha-fin"
                      name="fechaFin"
                      type="date"
                      min={minimoFin}
                      value={form.fechaFin || ""}
                      onChange={handleChange}
                    />
                  </label>
                </div>
                <label htmlFor="deduccion-motivo">
                  Motivo (opcional)
                  <textarea
                    id="deduccion-motivo"
                    name="motivo"
                    maxLength={500}
                    placeholder="Contá brevemente por qué querés solicitar esta deducción."
                    value={form.motivo}
                    onChange={handleChange}
                  />
                </label>
              </fieldset>

              <div className="deduccion-solicitudes-authorization">
                <ClipboardCheck size={20} aria-hidden="true" />
                <p>
                  Al enviar la solicitud autorizás la deducción del porcentaje
                  indicado, sujeta a revisión de Recursos Humanos.
                </p>
              </div>

              <div className="solicitud-create-actions">
                <Link
                  className="button button-secondary"
                  to="/solicitudes-deducciones"
                >
                  Cancelar
                </Link>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={loading || !!deduccionesError}
                >
                  Enviar solicitud
                </button>
              </div>
            </form>
          </section>

          <aside className="deduccion-solicitudes-aside">
            <section
              className="data-panel deduccion-solicitudes-card"
              aria-labelledby="deduccion-proceso-titulo"
            >
              <div className="deduccion-solicitudes-card-heading">
                <CalendarDays size={20} aria-hidden="true" />
                <h2 id="deduccion-proceso-titulo">¿Qué pasa después?</h2>
              </div>
              <ol className="deduccion-solicitudes-steps">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Enviás la solicitud</strong>
                    <p>Elegís un concepto adicional, porcentaje y fechas.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>RH la revisa</strong>
                    <p>Recursos Humanos aprueba o rechaza la deducción.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Consultás el resultado</strong>
                    <p>Podés seguir el estado desde el listado.</p>
                  </div>
                </li>
              </ol>
            </section>
            <section className="data-panel deduccion-solicitudes-card deduccion-solicitudes-hint">
              <h2>Antes de enviar</h2>
              <p>
                El porcentaje solicitado puede ser de hasta 20 %. Si querés
                limitar la deducción a un período, indicá una fecha final.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
