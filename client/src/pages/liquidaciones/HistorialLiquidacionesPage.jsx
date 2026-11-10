import { useEffect, useRef, useState } from "react";
import {
  Eye,
  Link2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import SearchBar from "../../components/searchBar.jsx";
import { formatDate } from "../../utils/fechaUtils.js";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { adaptarLiquidacionHistorica } from "../../utils/liquidacionesUtils.js";
import {
  getLiquidaciones,
  getLiquidacionById,
} from "../../services/liquidaciones.Service.js";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import {
  AvatarColaborador,
  DesgloseLiquidacion,
  EncabezadoLiquidaciones,
  moneda,
  nombreCompleto,
  nombreMotivo,
  normalizarBusqueda,
} from "./ComponentesLiquidacion.jsx";

export default function HistorialLiquidacionesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [detalleId, setDetalleId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [recargaDetalle, setRecargaDetalle] = useState(0);
  const detalleRef = useRef(null);
  const texto = normalizarBusqueda(busqueda);

  const {
    data: restaurantesData,
    isLoading: isLoadingRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(() => getRestaurantes("todos"), [reloadKey]);
  const restaurantes = restaurantesData ?? [];

  const {
    data: liquidacionesData,
    isLoading: isLoadingLiquidaciones,
    error: errorLiquidaciones,
  } = useAsyncRequest(() => getLiquidaciones(), [reloadKey]);

  const liquidaciones = errorLiquidaciones
    ? []
    : (liquidacionesData ?? []).map(adaptarLiquidacionHistorica);
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  const registros = rangoInvalido
    ? []
    : liquidaciones
        .filter(
          (registro) =>
            (!restaurante || String(registro.restauranteId) === restaurante) &&
            (!desde || registro.fechaSalida >= desde) &&
            (!hasta || registro.fechaSalida <= hasta) &&
            (normalizarBusqueda(nombreCompleto(registro)).includes(texto) ||
              registro.identificacion.includes(texto)),
        )
        .sort(
          (primero, segundo) =>
            segundo.fechaSalida.localeCompare(primero.fechaSalida) ||
            segundo.id - primero.id,
        );
  const totalRegistrado = registros.every((registro) =>
    Number.isFinite(registro.desglose.totalLiquidacion),
  )
    ? registros.reduce(
        (total, registro) => total + registro.desglose.totalLiquidacion,
        0,
      )
    : null;
  const sinVinculo = registros.filter(
    (registro) => registro.detallePlanillaId == null,
  ).length;
  const resumenDisponible =
    !isLoadingLiquidaciones && !errorLiquidaciones && !rangoInvalido;

  const {
    data: detalle,
    isLoading: isLoadingDetalle,
    error: errorDetalle,
  } = useAsyncRequest(async () => {
    if (detalleId === null) return null;
    const registro = await getLiquidacionById(detalleId);
    return adaptarLiquidacionHistorica(registro);
  }, [detalleId, recargaDetalle]);

  useEffect(() => {
    if (detalleId !== null) detalleRef.current?.focus();
  }, [detalleId]);
  function cambiarFiltro(actualizar, valor) {
    actualizar(valor);
    setDetalleId(null);
  }
  function limpiarFiltros() {
    setBusqueda("");
    setRestaurante("");
    setDesde("");
    setHasta("");
    setDetalleId(null);
  }
  function actualizarHistorial() {
    setDetalleId(null);
    setReloadKey((valor) => valor + 1);
  }
  return (
    <div className="liquidaciones-page">
      <EncabezadoLiquidaciones
        titulo="Histórico de liquidaciones"
        descripcion="Consultá los registros y el desglose de cada liquidación de personal."
      />
      <section
        className="liquidacion-indicadores"
        aria-label="Resumen del histórico"
      >
        <article className="data-panel">
          <span className="planilla-icono">
            <ReceiptText size={20} aria-hidden="true" />
          </span>
          <div>
            <p>Liquidaciones</p>
            <strong>{resumenDisponible ? registros.length : "—"}</strong>
          </div>
        </article>
        <article className="data-panel">
          <span className="planilla-icono">
            <Wallet size={20} aria-hidden="true" />
          </span>
          <div>
            <p>Total registrado</p>
            <strong>
              {resumenDisponible && totalRegistrado != null
                ? moneda.format(totalRegistrado)
                : "—"}
            </strong>
          </div>
        </article>
        <article className="data-panel">
          <span className="planilla-icono">
            <Link2 size={20} aria-hidden="true" />
          </span>
          <div>
            <p>Sin vínculo a planilla</p>
            <strong>{resumenDisponible ? sinVinculo : "—"}</strong>
          </div>
        </article>
      </section>
      <section
        className="data-panel catalog-form liquidacion-filtros-historico"
        aria-label="Filtros del histórico"
      >
        <SearchBar
          id="liquidacion-buscar-historico"
          entidad="colaborador"
          placeholder="Nombre o identificación"
          search={busqueda}
          setSearch={(valor) => cambiarFiltro(setBusqueda, valor)}
        />
        <label htmlFor="liquidacion-historico-restaurante">
          Restaurante
          <select
            id="liquidacion-historico-restaurante"
            value={restaurante}
            disabled={isLoadingRestaurantes}
            onChange={(event) =>
              cambiarFiltro(setRestaurante, event.target.value)
            }
          >
            <option value="">Todos los restaurantes</option>
            {restaurantes.map((restaurante) => (
              <option
                key={restaurante.RestauranteId}
                value={restaurante.RestauranteId}
              >
                {restaurante.Nombre}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="liquidacion-desde">
          Salida desde
          <input
            id="liquidacion-desde"
            type="date"
            value={desde}
            onChange={(event) => cambiarFiltro(setDesde, event.target.value)}
          />
        </label>
        <label htmlFor="liquidacion-hasta">
          Salida hasta
          <input
            id="liquidacion-hasta"
            type="date"
            value={hasta}
            onChange={(event) => cambiarFiltro(setHasta, event.target.value)}
          />
        </label>
        <div className="liquidacion-historico-acciones">
          <button
            type="button"
            className="button button-secondary"
            onClick={limpiarFiltros}
          >
            <RotateCcw size={15} aria-hidden="true" />
            Limpiar
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={isLoadingLiquidaciones || isLoadingRestaurantes}
            onClick={actualizarHistorial}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </section>
      <AlertMessage title="No se pudieron cargar las liquidaciones">
        {errorLiquidaciones}
      </AlertMessage>
      <AlertMessage title="No se pudieron cargar los restaurantes">
        {errorRestaurantes}
      </AlertMessage>
      <AlertMessage type="warning" title="Revisá el rango de fechas">
        {rangoInvalido
          ? "La fecha de salida desde no puede ser posterior a la fecha hasta."
          : null}
      </AlertMessage>
      <section
        className="data-panel liquidacion-historico-tabla"
        aria-label="Liquidaciones registradas"
      >
        <div className="liquidacion-listado-cantidad" role="status">
          {isLoadingLiquidaciones
            ? "Cargando liquidaciones…"
            : errorLiquidaciones
              ? "Histórico no disponible"
              : rangoInvalido
                ? "Rango de fechas inválido"
                : `${registros.length} ${registros.length === 1 ? "liquidación mostrada" : "liquidaciones mostradas"}`}
        </div>
        {isLoadingLiquidaciones ? (
          <LoadingState
            mensaje="Cargando histórico de liquidaciones..."
            compacto
          />
        ) : (
          !errorLiquidaciones &&
          !rangoInvalido && (
            <div
              className="table-scroll"
              role="region"
              aria-label="Histórico de liquidaciones"
              tabIndex={0}
            >
              <table className="liquidacion-tabla">
                <thead>
                  <tr>
                    <th scope="col">Colaborador</th>
                    <th scope="col">Fecha de salida</th>
                    <th scope="col">Motivo</th>
                    <th scope="col" className="planilla-numero">
                      Total
                    </th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registros.length === 0 && (
                    <tr>
                      <td colSpan={5} className="liquidacion-tabla-vacia">
                        {liquidaciones.length === 0
                          ? "No hay liquidaciones registradas."
                          : "No hay liquidaciones que coincidan con los filtros."}
                      </td>
                    </tr>
                  )}
                  {registros.map((registro) => (
                    <tr
                      key={registro.id}
                      className={
                        registro.id === detalleId
                          ? "liquidacion-fila-seleccionada"
                          : ""
                      }
                    >
                      <td>
                        <div className="liquidacion-persona-tabla">
                          <AvatarColaborador colaborador={registro} />
                          <div>
                            <strong>{nombreCompleto(registro)}</strong>
                            <small>
                              {registro.identificacion} · {registro.restaurante}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(registro.fechaSalida)}</td>
                      <td>
                        <span className="liquidacion-motivo-texto">
                          {nombreMotivo(registro.motivoSalida)}
                        </span>
                      </td>
                      <td className="planilla-numero">
                        <strong>
                          {registro.desglose.totalLiquidacion == null
                            ? "—"
                            : moneda.format(registro.desglose.totalLiquidacion)}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="liquidacion-enlace"
                          aria-expanded={detalleId === registro.id}
                          aria-controls="liquidacion-detalle-historico"
                          onClick={() => {
                            setDetalleId(registro.id);
                            setRecargaDetalle((valor) => valor + 1);
                          }}
                        >
                          <Eye size={16} aria-hidden="true" />
                          Ver detalle
                          <span className="sr-only">
                            {" "}
                            de {nombreCompleto(registro)}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
      {detalleId !== null && (
        <section
          className="data-panel liquidacion-detalle-historico"
          id="liquidacion-detalle-historico"
          ref={detalleRef}
          tabIndex={-1}
          aria-labelledby="liquidacion-detalle-titulo"
        >
          <div className="liquidacion-detalle-encabezado">
            <div>
              <p className="eyebrow accent">DETALLE DEL REGISTRO</p>
              <h2 id="liquidacion-detalle-titulo">Liquidación #{detalleId}</h2>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDetalleId(null)}
            >
              <X size={16} aria-hidden="true" />
              Cerrar detalle
            </button>
          </div>
          {isLoadingDetalle ? (
            <LoadingState
              mensaje="Cargando detalle de liquidación..."
              compacto
            />
          ) : errorDetalle ? (
            <>
              <AlertMessage title="No se pudo cargar el detalle">
                {errorDetalle}
              </AlertMessage>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRecargaDetalle((valor) => valor + 1)}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Reintentar
              </button>
            </>
          ) : (
            detalle && (
              <div className="liquidacion-detalle-columnas">
                <div>
                  <div className="liquidacion-detalle-persona">
                    <AvatarColaborador colaborador={detalle} />
                    <div>
                      <h3>{nombreCompleto(detalle)}</h3>
                      <p>{detalle.identificacion}</p>
                    </div>
                  </div>
                  <dl className="liquidacion-datos">
                    <div>
                      <dt>Restaurante</dt>
                      <dd>{detalle.restaurante}</dd>
                    </div>
                    <div>
                      <dt>Fecha de ingreso</dt>
                      <dd>{formatDate(detalle.fechaIngreso)}</dd>
                    </div>
                    <div>
                      <dt>Fecha de salida</dt>
                      <dd>{formatDate(detalle.fechaSalida)}</dd>
                    </div>
                    <div>
                      <dt>Motivo</dt>
                      <dd>{nombreMotivo(detalle.motivoSalida)}</dd>
                    </div>
                    <div>
                      <dt>Registrado por</dt>
                      <dd>{detalle.registradoPor}</dd>
                    </div>
                    <div>
                      <dt>Vínculo con planilla</dt>
                      <dd>
                        <span className="liquidacion-etiqueta">
                          {detalle.detallePlanillaId != null ? (
                            <Link
                              to={`/planillas/detalle/${detalle.detallePlanillaId}`}
                              className="liquidacion-enlace"
                            >
                              Detalle #{detalle.detallePlanillaId}
                            </Link>
                          ) : (
                            "Sin vincular"
                          )}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <div className="liquidacion-observacion">
                    <h3>Observación</h3>
                    <p>{detalle.observacion || "Sin observación."}</p>
                  </div>
                </div>
                <div>
                  <DesgloseLiquidacion resultado={detalle.desglose} />
                </div>
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
}
