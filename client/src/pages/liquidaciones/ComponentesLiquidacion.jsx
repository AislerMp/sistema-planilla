import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import Dialog from "../../components/dialog.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { formatDate } from "../../utils/fechaUtils.js";
import { motivosSalida } from "../../utils/liquidacionesUtils.js";

export const moneda = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
});

const mostrarImporte = (valor) =>
  valor == null || !Number.isFinite(Number(valor)) ? "—" : moneda.format(valor);
const mostrarMeses = (valor) =>
  valor == null || !Number.isFinite(Number(valor))
    ? "—"
    : new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 }).format(
        valor,
      );

export const nombreCompleto = (persona) =>
  `${persona.nombres} ${persona.apellidos}`;

export const nombreMotivo = (codigo) =>
  motivosSalida.find((motivo) => motivo.codigo === codigo)?.nombre ?? codigo;

export const normalizarBusqueda = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function EncabezadoLiquidaciones({ titulo, descripcion }) {
  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <span>Liquidaciones</span>
      </div>
      <header className="page-header liquidacion-encabezado">
        <div>
          <p className="eyebrow accent">GESTIÓN DE PERSONAL</p>
          <h1>{titulo}</h1>
          <p>{descripcion}</p>
        </div>
      </header>
      <nav
        className="planilla-tabs liquidacion-tabs"
        aria-label="Secciones de liquidaciones"
      >
        <NavLink to="/liquidaciones" end>
          Colaboradores
        </NavLink>
        <NavLink to="/liquidaciones/historico">
          Histórico de liquidaciones
        </NavLink>
      </nav>
    </>
  );
}

export function AvatarColaborador({ colaborador, grande = false }) {
  return (
    <span
      className={`liquidacion-avatar${grande ? " liquidacion-avatar--grande" : ""}`}
      aria-hidden="true"
    >
      {colaborador.nombres[0]}
      {colaborador.apellidos[0]}
    </span>
  );
}

export function FichaColaborador({
  colaborador,
  compacta = false,
  cargandoVacaciones = false,
  errorVacaciones = null,
}) {
  if (!colaborador) {
    return (
      <aside className="data-panel liquidacion-ficha liquidacion-sin-seleccion">
        <BadgeCheck size={32} aria-hidden="true" />
        <h2>Seleccioná un colaborador</h2>
        <p>Su información aparecerá aquí para preparar la liquidación.</p>
      </aside>
    );
  }
  if (compacta) {
    return (
      <section
        className="data-panel liquidacion-ficha-compacta"
        aria-label="Colaborador seleccionado"
      >
        <AvatarColaborador colaborador={colaborador} />
        <div className="liquidacion-identidad">
          <h2>{nombreCompleto(colaborador)}</h2>
          <p>
            {colaborador.identificacion} · {colaborador.restaurante}
          </p>
        </div>
        <dl>
          <div>
            <dt>Fecha de ingreso</dt>
            <dd>{formatDate(colaborador.fechaIngreso)}</dd>
          </div>
          <div>
            <dt>Antigüedad</dt>
            <dd>{colaborador.antiguedad}</dd>
          </div>
        </dl>
        <Link to="/liquidaciones" className="liquidacion-enlace">
          Cambiar colaborador
        </Link>
      </section>
    );
  }
  return (
    <aside
      className="data-panel liquidacion-ficha"
      aria-label="Ficha del colaborador seleccionado"
    >
      <p className="eyebrow">COLABORADOR SELECCIONADO</p>
      <div className="liquidacion-ficha-persona">
        <AvatarColaborador colaborador={colaborador} grande />
        <span className="liquidacion-activo">
          <span aria-hidden="true" />
          Activo
        </span>
      </div>
      <h2>{nombreCompleto(colaborador)}</h2>
      <p className="liquidacion-puesto">
        {colaborador.puesto} · {colaborador.restaurante}
      </p>
      <dl className="liquidacion-datos">
        <div>
          <dt>Identificación</dt>
          <dd>{colaborador.identificacion}</dd>
        </div>
        <div>
          <dt>Fecha de ingreso</dt>
          <dd>{formatDate(colaborador.fechaIngreso)}</dd>
        </div>
        <div>
          <dt>Antigüedad</dt>
          <dd>{colaborador.antiguedad}</dd>
        </div>
        <div>
          <dt>Tarifa por hora</dt>
          <dd>
            {colaborador.tarifaHora == null
              ? "Sin tarifa asignada"
              : moneda.format(colaborador.tarifaHora)}
          </dd>
        </div>
        <div>
          <dt>Vacaciones disponibles</dt>
          <dd>
            {cargandoVacaciones
              ? "Consultando…"
              : errorVacaciones
                ? "No disponible"
                : colaborador.vacacionesDisponibles == null
                  ? "Sin saldo disponible"
                  : `${colaborador.vacacionesDisponibles} días`}
          </dd>
        </div>
      </dl>
      <AlertMessage title="No se pudo consultar el saldo de vacaciones">
        {errorVacaciones}
      </AlertMessage>
      <Link
        className="button button-primary liquidacion-boton-completo"
        to={`/liquidaciones/nueva/${colaborador.id}`}
      >
        Preparar liquidación <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <p className="liquidacion-nota">
        Revisá los datos de salida antes de continuar.
      </p>
    </aside>
  );
}

export function DesgloseLiquidacion({
  resultado,
  preliminar = false,
  mostrarBase = false,
  colaborador = null,
}) {
  const base = resultado.baseCalculo;
  const promedio = base?.promedioSalarial;
  const prestaciones = [
    {
      nombre: "Vacaciones",
      detalle: `${resultado.diasVacacionesPagados} días`,
      monto: resultado.montoVacaciones,
    },
    {
      nombre: "Aguinaldo proporcional",
      detalle: "Acumulado del período",
      monto: resultado.montoAguinaldo,
    },
    {
      nombre: "Preaviso",
      detalle: `${resultado.diasPreavisoPagados} días`,
      monto: resultado.montoPreaviso,
    },
    {
      nombre: "Cesantía",
      detalle: `${resultado.diasCesantiaPagados} días`,
      monto: resultado.montoCesantia,
    },
  ];
  return (
    <>
      <dl className="liquidacion-prestaciones">
        {prestaciones.map((prestacion) => (
          <div key={prestacion.nombre}>
            <dt>
              {prestacion.nombre}
              <small>{prestacion.detalle}</small>
            </dt>
            <dd>{mostrarImporte(prestacion.monto)}</dd>
          </div>
        ))}
      </dl>
      <div className="liquidacion-total">
        <div>
          <span>Total de liquidación</span>
          {preliminar && (
            <span className="liquidacion-preliminar">Preliminar</span>
          )}
        </div>
        <strong>{mostrarImporte(resultado.totalLiquidacion)}</strong>
        <small>
          {preliminar
            ? "Cálculo preliminar pendiente de revisión."
            : "Total del registro."}
        </small>
      </div>
      {mostrarBase && (
        <details className="liquidacion-base">
          <summary>Ver base del cálculo</summary>
          <dl className="liquidacion-datos">
            {colaborador && (
              <div>
                <dt>Colaborador</dt>
                <dd>{nombreCompleto(colaborador)}</dd>
              </div>
            )}
            <div>
              <dt>Fecha de ingreso</dt>
              <dd>
                {base?.fechaIngreso || colaborador?.fechaIngreso
                  ? formatDate(base?.fechaIngreso ?? colaborador.fechaIngreso)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Fecha de salida</dt>
              <dd>
                {resultado.fechaSalida
                  ? formatDate(resultado.fechaSalida)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Antigüedad al salir</dt>
              <dd>
                {base?.antiguedadMeses == null
                  ? "—"
                  : `${mostrarMeses(base.antiguedadMeses)} meses`}
              </dd>
            </div>
            <div>
              <dt>Tarifa por hora</dt>
              <dd>
                {mostrarImporte(base?.tarifaHora ?? colaborador?.tarifaHora)}
              </dd>
            </div>
            <div>
              <dt>Base diaria de vacaciones</dt>
              <dd>{mostrarImporte(base?.salarioDiarioVacaciones)}</dd>
            </div>
            {promedio && (
              <>
                <div>
                  <dt>Período del promedio</dt>
                  <dd>
                    {formatDate(promedio.desde)} — {formatDate(promedio.hasta)}
                  </dd>
                </div>
                <div>
                  <dt>Salario acumulado</dt>
                  <dd>{mostrarImporte(promedio.salarioAcumulado)}</dd>
                </div>
                <div>
                  <dt>Salario promedio mensual</dt>
                  <dd>{mostrarImporte(promedio.salarioPromedioMensual)}</dd>
                </div>
                <div>
                  <dt>Salario diario de referencia</dt>
                  <dd>{mostrarImporte(promedio.salarioDiario)}</dd>
                </div>
                <div>
                  <dt>Meses considerados</dt>
                  <dd>{mostrarMeses(promedio.mesesConsiderados)}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="liquidacion-nota">
            {!base
              ? "El servidor no devolvió la base salarial de este cálculo."
              : promedio
                ? "Importes y período utilizados por el servidor para este cálculo."
                : "Este cálculo no requiere un promedio salarial para preaviso o cesantía."}
          </p>
        </details>
      )}
    </>
  );
}

export function FormularioSalida({
  datos,
  onChange,
  onCalcular,
  calculando = false,
  deshabilitado = false,
  ocupado = false,
}) {
  const conResponsabilidad =
    datos.motivoSalida === "DESPIDO_CON_RESPONSABILIDAD";

  return (
    <form
      className="data-panel catalog-form liquidacion-formulario"
      onSubmit={onCalcular}
      aria-busy={ocupado || calculando}
    >
      <div className="liquidacion-panel-titulo">
        <span className="planilla-icono">
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>Datos de salida</h2>
          <p>Completá la información de la salida del colaborador.</p>
        </div>
      </div>

      <label htmlFor="liquidacion-fecha">
        Último día de servicio
        <input
          id="liquidacion-fecha"
          type="date"
          value={datos.fechaSalida}
          required
          disabled={ocupado}
          onChange={(event) => onChange("fechaSalida", event.target.value)}
        />
      </label>

      <fieldset className="liquidacion-motivos" disabled={ocupado}>
        <legend>Motivo de salida</legend>
        {motivosSalida.map((motivo) => (
          <label className="liquidacion-motivo" key={motivo.codigo}>
            <input
              type="radio"
              name="motivoSalida"
              value={motivo.codigo}
              checked={datos.motivoSalida === motivo.codigo}
              onChange={(event) => onChange("motivoSalida", event.target.value)}
            />
            <span>
              <strong>{motivo.nombre}</strong>
              <small>{motivo.descripcion}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {conResponsabilidad && (
        <label htmlFor="liquidacion-preaviso">
          Días de preaviso cumplidos
          <input
            id="liquidacion-preaviso"
            type="number"
            min="0"
            step="1"
            disabled={ocupado}
            value={datos.diasPreavisoTrabajados}
            onChange={(event) =>
              onChange("diasPreavisoTrabajados", event.target.value)
            }
          />
          <small className="liquidacion-nota">
            Días de preaviso que el colaborador ya cumplió.
          </small>
        </label>
      )}

      <label htmlFor="liquidacion-observacion">
        <span>
          Observación <span className="liquidacion-opcional">Opcional</span>
        </span>
        <textarea
          id="liquidacion-observacion"
          rows={4}
          maxLength={500}
          disabled={ocupado}
          placeholder="Agregá información relevante sobre la salida…"
          value={datos.observacion}
          onChange={(event) => onChange("observacion", event.target.value)}
          aria-describedby="liquidacion-caracteres"
        />
      </label>

      <p className="liquidacion-contador" id="liquidacion-caracteres">
        {datos.observacion.length}/500 caracteres
      </p>

      <div className="liquidacion-formulario-pie">
        <span className="liquidacion-nota">
          Revisá los datos antes de consultar el desglose.
        </span>
        <button
          className="button button-primary"
          type="submit"
          disabled={calculando || deshabilitado || ocupado}
        >
          <ReceiptText size={17} aria-hidden="true" />
          {calculando ? "Calculando..." : "Calcular liquidación"}
        </button>
      </div>
    </form>
  );
}

export function ConfirmarLiquidacionModal({
  colaborador,
  fechaSalida,
  resultado,
  onCerrar,
  onConfirmar,
  registrando = false,
  error = null,
}) {
  const [revisado, setRevisado] = useState(false);
  return (
    <Dialog
      titulo="Confirmar liquidación"
      subtitulo="CONFIRMACIÓN DE SALIDA"
      className="liquidacion-modal"
      onCerrar={onCerrar}
      ocupado={registrando}
    >
      <dl className="liquidacion-datos">
        <div>
          <dt>Colaborador</dt>
          <dd>{nombreCompleto(colaborador)}</dd>
        </div>
        <div>
          <dt>Fecha de salida</dt>
          <dd>{formatDate(fechaSalida)}</dd>
        </div>
      </dl>
      <div className="liquidacion-total">
        <span>Total de liquidación</span>
        <strong>{mostrarImporte(resultado.totalLiquidacion)}</strong>
      </div>
      <AlertMessage type="warning" title="Efectos del registro">
        Al registrar se inactivará al colaborador y se descontarán las
        vacaciones incluidas en esta liquidación. El servidor volverá a calcular
        los importes.
      </AlertMessage>
      <AlertMessage title="No se pudo registrar la liquidación">
        {error}
      </AlertMessage>
      {registrando && (
        <LoadingState mensaje="Registrando liquidación..." compacto />
      )}
      <label className="planilla-confirmacion-check">
        <input
          type="checkbox"
          checked={revisado}
          disabled={registrando}
          onChange={(event) => setRevisado(event.target.checked)}
        />
        <span>Revisé los datos de salida y los montos de la liquidación</span>
      </label>
      <div className="solicitud-create-actions liquidacion-modal-acciones">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCerrar}
          disabled={registrando}
        >
          Volver a revisar
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!revisado || registrando}
          onClick={() => {
            if (revisado && !registrando) onConfirmar();
          }}
        >
          <ShieldCheck size={17} aria-hidden="true" />
          {registrando ? "Registrando..." : "Registrar liquidación"}
        </button>
      </div>
    </Dialog>
  );
}
