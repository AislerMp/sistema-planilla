import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarX2,
  History,
  Layers3,
  Pencil,
  ReceiptText,
} from "lucide-react";

import useAsyncRequest from "../../../hooks/useAsyncRequest.js";

import {
  actualizarDatosDeduccion,
  crearVersionDeduccion,
  finalizarVigenciaDeduccion,
  getDeduccionById,
  getDeducciones,
} from "../../../services/deducciones.Service.js";

import { obtenerFechaHoyCostaRica } from "../../../utils/fechaUtils.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import Dialog from "../../../components/dialog.jsx";
import LoadingState from "../../../components/loadingState.jsx";

const formatoPorcentaje = new Intl.NumberFormat("es-CR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function mostrarFecha(fecha) {
  if (!fecha) return "Sin fecha final";
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return [dia, mes, anio].join("/");
}

function mostrarPorcentaje(valor) {
  return valor == null
    ? "A elección del colaborador"
    : formatoPorcentaje.format(valor) + " %";
}

function estadoVigencia(version, hoy) {
  const inicio = version.FechaVigenciaInicio.slice(0, 10);
  const fin = version.FechaVigenciaFin?.slice(0, 10) ?? null;
  if (hoy < inicio) return "Próxima";
  if (fin && hoy > fin) return "Finalizada";
  return "Vigente";
}

function siguienteDia(fecha) {
  const dia = new Date(fecha + "T00:00:00Z");
  dia.setUTCDate(dia.getUTCDate() + 1);
  return dia.toISOString().slice(0, 10);
}

export default function GestionarDeduccion() {
  const { deduccionId } = useParams();
  const [recarga, setRecarga] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({
    nombre: "",
    entidadReceptora: "",
    porcentaje: "",
    fechaVigenciaInicio: "",
    fechaVigenciaFin: "",
    fechaFin: "",
  });

  const [errorAccion, setErrorAccion] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const {
    data: deduccion,
    error: deduccionError,
    isLoading,
  } = useAsyncRequest(
    () => getDeduccionById(deduccionId),
    [deduccionId, recarga],
  );

  const {
    data: historial,
    error: historialError,
    isLoading: cargandoHistorial,
  } = useAsyncRequest(
    () =>
      dialog === "historial" && deduccion
        ? getDeducciones({ codigo: deduccion.Codigo })
        : [],
    [dialog, deduccion?.Codigo, recarga],
  );

  function abrirDialog(tipo) {
    const hoy = obtenerFechaHoyCostaRica();
    const inicio = deduccion.FechaVigenciaInicio.slice(0, 10);
    const fin = deduccion.FechaVigenciaFin?.slice(0, 10) ?? "";

    setErrorAccion(null);
    setMensajeExito(null);
    setForm({
      nombre: deduccion.Nombre,
      entidadReceptora: deduccion.EntidadReceptora ?? "",
      porcentaje: "",
      fechaVigenciaInicio: "",
      fechaVigenciaFin: "",
      fechaFin: fin || (hoy > inicio ? hoy : inicio),
    });
    setDialog(tipo);
  }

  function cerrarDialog() {
    if (!isBusy) setDialog(null);
  }

  function cambiarCampo(event) {
    const { name, value } = event.target;
    setForm((actual) => ({ ...actual, [name]: value }));
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    setIsBusy(true);
    setErrorAccion(null);

    try {
      await actualizarDatosDeduccion(deduccionId, {
        nombre: form.nombre.trim(),
        entidadReceptora: form.entidadReceptora.trim() || null,
      });

      setMensajeExito("Los datos del concepto se actualizaron correctamente.");
      setDialog(null);
      setRecarga((actual) => actual + 1);

    } catch (error) {
      setErrorAccion(error.message || "No se pudo actualizar el concepto.");

    } finally {
      setIsBusy(false);
    }
  }

  async function guardarVersion(event) {
    event.preventDefault();
    setIsBusy(true);
    setErrorAccion(null);
    
    try {
      await crearVersionDeduccion(deduccionId, {
        fechaVigenciaInicio: form.fechaVigenciaInicio,
        fechaVigenciaFin: form.fechaVigenciaFin || null,
        porcentaje:
          deduccion.TipoDeduccion === "LEGAL" ? Number(form.porcentaje) : null,
      });

      setMensajeExito(
        "La nueva versión se creó correctamente. Podés verla en el historial.",
      );

      setDialog(null);
      setRecarga((actual) => actual + 1);

    } catch (error) {
      setErrorAccion(error.message || "No se pudo crear la versión.");

    } finally {
      setIsBusy(false);
    }
  }

  async function guardarFinVigencia(event) {
    event.preventDefault();
    setIsBusy(true);
    setErrorAccion(null);

    try {
      await finalizarVigenciaDeduccion(deduccionId, form.fechaFin);
      setMensajeExito("La fecha final de vigencia se guardó correctamente.");
      setDialog(null);
      setRecarga((actual) => actual + 1);

    } catch (error) {
      setErrorAccion(error.message || "No se pudo finalizar la vigencia.");

    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return (
      <LoadingState
        entidad="deducción"
        mensaje="Cargando deducción..."
        descripcion="Por favor, esperá mientras se obtienen los datos del concepto."
      />
    );
  }

  if (deduccionError || !deduccion) {
    return (
      <AlertMessage title="No se pudo cargar el concepto">
        {deduccionError || "El concepto no está disponible."}
      </AlertMessage>
    );
  }

  const hoy = obtenerFechaHoyCostaRica();
  const inicio = deduccion.FechaVigenciaInicio.slice(0, 10);
  const fin = deduccion.FechaVigenciaFin?.slice(0, 10) ?? null;
  const estado = estadoVigencia(deduccion, hoy);

  const diaPosterior = siguienteDia(inicio);
  const minimoVersion = diaPosterior > hoy ? diaPosterior : hoy;
  const minimoFin = inicio > hoy ? inicio : hoy;
  
  const badgeEstado =
    "status-badge status-badge--" +
    (estado === "Vigente" ? "active" : "inactive");

  const resumenConcepto = (
    <div className="deducciones-dialog-resumen">
      <strong>{deduccion.Nombre}</strong>
      <span>
        {deduccion.Codigo} · {mostrarPorcentaje(deduccion.Porcentaje)}
      </span>
    </div>
  );
  const errorEnDialog = errorAccion && (
    <AlertMessage title="No se pudo completar la acción">
      {errorAccion}
    </AlertMessage>
  );

  return (
    <div className="deducciones-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/deducciones">Deducciones</Link> / <span>Gestionar</span>
      </div>

      <Link className="deducciones-volver" to="/deducciones">
        <ArrowLeft size={16} aria-hidden="true" /> Volver al catálogo
      </Link>

      <div className="page-header deducciones-page-heading">
        <div>
          <p className="eyebrow accent">CATÁLOGO DE DEDUCCIONES</p>
          <h1>Gestionar concepto</h1>
          <p>Consultá la versión seleccionada y administrá sus cambios.</p>
        </div>
      </div>

      {mensajeExito && (
        <AlertMessage
          type="success"
          title="Cambio guardado"
          onClose={() => setMensajeExito(null)}
        >
          {mensajeExito}
        </AlertMessage>
      )}

      <section
        className="data-panel deducciones-overview"
        aria-label="Concepto seleccionado"
      >
        <div className="deducciones-overview-main">
          <div className="deducciones-section-icon">
            <ReceiptText size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="deducciones-kicker">CONCEPTO SELECCIONADO</p>
            <h2>{deduccion.Nombre}</h2>
            <p className="deducciones-overview-code">{deduccion.Codigo}</p>
          </div>
        </div>
        <span className={badgeEstado}>
          <span /> {estado}
        </span>
      </section>

      <div className="deducciones-management-layout">
        <section
          className="data-panel deducciones-info-panel"
          aria-labelledby="version-titulo"
        >
          <div className="deducciones-section-heading">
            <div>
              <p className="deducciones-kicker">DETALLE</p>
              <h2 id="version-titulo">Versión seleccionada</h2>
            </div>
            <span className="deducciones-version-id">
              #{deduccion.DeduccionId}
            </span>
          </div>
          <dl className="deducciones-detail-grid">
            <div>
              <dt>Tipo de deducción</dt>
              <dd>
                {deduccion.TipoDeduccion === "LEGAL" ? "Legal" : "Adicional"}
              </dd>
            </div>
            <div>
              <dt>Porcentaje</dt>
              <dd>{mostrarPorcentaje(deduccion.Porcentaje)}</dd>
            </div>
            <div>
              <dt>Entidad receptora</dt>
              <dd>{deduccion.EntidadReceptora || "No indicada"}</dd>
            </div>
            <div>
              <dt>Inicio de vigencia</dt>
              <dd>{mostrarFecha(deduccion.FechaVigenciaInicio)}</dd>
            </div>
            <div>
              <dt>Fin de vigencia</dt>
              <dd>{mostrarFecha(deduccion.FechaVigenciaFin)}</dd>
            </div>
          </dl>
        </section>

        <aside
          className="data-panel deducciones-action-panel"
          aria-labelledby="acciones-titulo"
        >
          <div className="deducciones-section-heading">
            <div>
              <p className="deducciones-kicker">MANTENIMIENTO</p>
              <h2 id="acciones-titulo">Acciones</h2>
            </div>
          </div>
          <p>Elegí qué querés hacer con esta versión del catálogo.</p>
          <div className="deducciones-action-list">
            <button type="button" onClick={() => abrirDialog("editar")}>
              <Pencil size={18} aria-hidden="true" />
              <span>Editar nombre y entidad</span>
            </button>
            <button type="button" onClick={() => abrirDialog("nuevaVersion")}>
              <Layers3 size={18} aria-hidden="true" />
              <span>Crear nueva versión</span>
            </button>
            <button type="button" onClick={() => abrirDialog("historial")}>
              <History size={18} aria-hidden="true" />
              <span>Ver historial</span>
            </button>
            <button
              type="button"
              onClick={() => abrirDialog("finalizar")}
              disabled={estado === "Finalizada"}
              title={
                estado === "Finalizada"
                  ? "Esta vigencia ya finalizó."
                  : undefined
              }
            >
              <CalendarX2 size={18} aria-hidden="true" />
              <span>Finalizar vigencia</span>
            </button>
          </div>
        </aside>
      </div>

      {dialog === "editar" && (
        <Dialog
          titulo="Editar datos"
          subtitulo="Actualizá el nombre y la entidad receptora."
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          {resumenConcepto}
          {errorEnDialog}
          <form className="deducciones-dialog-form" onSubmit={guardarEdicion}>
            <div className="deducciones-dialog-fields">
              <label htmlFor="deduccion-editar-nombre">
                Nombre
                <input
                  id="deduccion-editar-nombre"
                  name="nombre"
                  type="text"
                  maxLength={100}
                  value={form.nombre}
                  onChange={cambiarCampo}
                  disabled={isBusy}
                  required
                />
              </label>
              <label htmlFor="deduccion-editar-entidad">
                Entidad receptora (opcional)
                <input
                  id="deduccion-editar-entidad"
                  name="entidadReceptora"
                  type="text"
                  maxLength={100}
                  value={form.entidadReceptora}
                  onChange={cambiarCampo}
                  disabled={isBusy}
                />
              </label>
            </div>
            <div className="table-actions deducciones-form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={cerrarDialog}
                disabled={isBusy}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={isBusy}
              >
                {isBusy ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {dialog === "nuevaVersion" && (
        <Dialog
          titulo="Nueva versión"
          subtitulo="La configuración anterior queda en el historial."
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          {resumenConcepto}
          <p className="deducciones-dialog-nota">
            La versión seleccionada terminará, si corresponde, el día anterior
            al nuevo inicio.
          </p>
          {errorEnDialog}
          <form className="deducciones-dialog-form" onSubmit={guardarVersion}>
            <div className="deducciones-dialog-fields">
              {deduccion.TipoDeduccion === "LEGAL" && (
                <label htmlFor="deduccion-version-porcentaje">
                  Nuevo porcentaje (%)
                  <input
                    id="deduccion-version-porcentaje"
                    name="porcentaje"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={form.porcentaje}
                    onChange={cambiarCampo}
                    disabled={isBusy}
                    required
                  />
                </label>
              )}
              <label htmlFor="deduccion-version-inicio">
                Inicio de la nueva versión
                <input
                  id="deduccion-version-inicio"
                  name="fechaVigenciaInicio"
                  type="date"
                  min={minimoVersion}
                  value={form.fechaVigenciaInicio}
                  onChange={cambiarCampo}
                  disabled={isBusy}
                  required
                />
              </label>
              <label htmlFor="deduccion-version-fin">
                Fin de vigencia (opcional)
                <input
                  id="deduccion-version-fin"
                  name="fechaVigenciaFin"
                  type="date"
                  min={form.fechaVigenciaInicio || minimoVersion}
                  value={form.fechaVigenciaFin}
                  onChange={cambiarCampo}
                  disabled={isBusy}
                />
              </label>
            </div>
            <div className="table-actions deducciones-form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={cerrarDialog}
                disabled={isBusy}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={isBusy}
              >
                {isBusy ? "Guardando..." : "Guardar nueva versión"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {dialog === "historial" && (
        <Dialog
          titulo="Historial del concepto"
          subtitulo={deduccion.Nombre + " · " + deduccion.Codigo}
          onCerrar={cerrarDialog}
        >
          <div className="deducciones-history-heading">
            <p>Versiones registradas de este concepto</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => abrirDialog("nuevaVersion")}
            >
              Nueva versión
            </button>
          </div>
          {cargandoHistorial ? (
            <p className="deducciones-history-message">Cargando historial...</p>
          ) : historialError ? (
            <AlertMessage title="No se pudo cargar el historial">
              {historialError}
            </AlertMessage>
          ) : !historial?.length ? (
            <p className="deducciones-history-message">
              No hay versiones para mostrar.
            </p>
          ) : (
            <div
              className="table-scroll deducciones-history-table"
              role="region"
              aria-label="Historial de versiones"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Porcentaje</th>
                    <th scope="col">Desde</th>
                    <th scope="col">Hasta</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((version) => {
                    const estadoVersion = estadoVigencia(version, hoy);
                    return (
                      <tr key={version.DeduccionId}>
                        <td>
                          <strong>
                            {mostrarPorcentaje(version.Porcentaje)}
                          </strong>
                        </td>
                        <td>{mostrarFecha(version.FechaVigenciaInicio)}</td>
                        <td>{mostrarFecha(version.FechaVigenciaFin)}</td>
                        <td>
                          <span
                            className={
                              "status-badge status-badge--" +
                              (estadoVersion === "Vigente"
                                ? "active"
                                : "inactive")
                            }
                          >
                            <span /> {estadoVersion}
                          </span>
                        </td>
                        <td>
                          <Link
                            className="button button-secondary"
                            to={"/deducciones/" + version.DeduccionId}
                            onClick={cerrarDialog}
                          >
                            {version.DeduccionId === deduccion.DeduccionId
                              ? "Seleccionada"
                              : "Gestionar"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Dialog>
      )}

      {dialog === "finalizar" && (
        <Dialog
          titulo="Finalizar vigencia"
          subtitulo="Definí el último día de esta versión."
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          {resumenConcepto}
          {errorEnDialog}
          <form
            className="deducciones-dialog-form"
            onSubmit={guardarFinVigencia}
          >
            <div className="deducciones-dialog-fields">
              <label htmlFor="deduccion-finalizar-fecha">
                Último día de vigencia
                <input
                  id="deduccion-finalizar-fecha"
                  name="fechaFin"
                  type="date"
                  min={minimoFin}
                  max={fin || undefined}
                  value={form.fechaFin}
                  onChange={cambiarCampo}
                  disabled={isBusy}
                  required
                />
              </label>
            </div>
            <p className="deducciones-dialog-nota">
              El concepto todavía aplica durante el día seleccionado.
            </p>
            <div className="table-actions deducciones-form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={cerrarDialog}
                disabled={isBusy}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={isBusy}
              >
                {isBusy ? "Guardando..." : "Confirmar fecha final"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
