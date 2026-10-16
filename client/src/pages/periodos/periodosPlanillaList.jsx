import { useState } from "react";
import { CheckCheck, Search, X } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import SearchBar from "../../components/searchBar.jsx";
import { estadoLabels, filtrarPeriodos } from "../../utils/periodosUtils.js";
import { formatDate, obtenerFechaHoyCostaRica } from "../../utils/fechaUtils.js";

const filtrosVacios = { desde: "", hasta: "", estado: "", anio: "", busqueda: "" };

export default function PeriodosPlanillaList({ periodos, isLoading, error, pagandoId, onConfirmarPago }) {
  const [filtros, setFiltros] = useState(filtrosVacios);
  const [filtrosAplicados, setFiltrosAplicados] = useState(filtrosVacios);
  const anios = [...new Set(periodos.map((periodo) => String(periodo.FechaInicio).slice(0, 4)))].sort().reverse();
  const rows = filtrarPeriodos(periodos, filtrosAplicados);
  const fechaHoy = obtenerFechaHoyCostaRica();

  function consultar(event) {
    event.preventDefault();
    setFiltrosAplicados({ ...filtros });
  }

  function limpiarFiltros() {
    setFiltros(filtrosVacios);
    setFiltrosAplicados(filtrosVacios);
  }

  return (
    <>
      <section className="data-panel period-filters" aria-labelledby="period-filters-title">
        <h2 id="period-filters-title">Consultar períodos</h2>
        <p className="period-note">El rango incluye los períodos que coincidan total o parcialmente con las fechas seleccionadas.</p>
        <form onSubmit={consultar}>
          <fieldset disabled={isLoading || pagandoId !== null}>
            <legend className="sr-only">Filtros de períodos</legend>
            <div className="period-filter-fields">
              <label>Desde
                <input type="date" value={filtros.desde} onChange={(event) => setFiltros({ ...filtros, desde: event.target.value })} />
              </label>
              <label>Hasta
                <input type="date" min={filtros.desde || undefined} value={filtros.hasta} onChange={(event) => setFiltros({ ...filtros, hasta: event.target.value })} />
              </label>
              <label>Estado
                <select value={filtros.estado} onChange={(event) => setFiltros({ ...filtros, estado: event.target.value })}>
                  <option value="">Todos los estados</option>
                  {Object.entries(estadoLabels).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
                </select>
              </label>
              <label>Año de inicio
                <select value={filtros.anio} onChange={(event) => setFiltros({ ...filtros, anio: event.target.value })}>
                  <option value="">Todos los años</option>
                  {anios.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
                </select>
              </label>
            </div>
            <div className="period-filter-actions">
              <SearchBar search={filtros.busqueda} setSearch={(busqueda) => setFiltros({ ...filtros, busqueda })} entidad="por fecha o estado" id="periodos-search" />
              <button type="submit" className="button button-primary"><Search size={16} aria-hidden="true" /> Consultar</button>
              <button type="button" className="button button-secondary" onClick={limpiarFiltros}><X size={16} aria-hidden="true" /> Limpiar filtros</button>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="data-panel period-list" aria-labelledby="period-list-title">
        <div className="table-toolbar">
          <h2 id="period-list-title">Calendario de períodos</h2>
          {!isLoading && !error && <span className="muted" role="status">{rows.length} {rows.length === 1 ? "período" : "períodos"}</span>}
        </div>
        {isLoading ? (
          <LoadingState entidad="períodos" />
        ) : error ? (
          <div className="catalog-message"><AlertMessage title="No se pudieron cargar los períodos">{error}</AlertMessage></div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><p>{periodos.length ? "No hay períodos que coincidan con los filtros." : "No hay períodos registrados en el calendario."}</p></div>
        ) : (
          <div className="table-scroll" role="region" aria-label="Tabla de períodos" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Inicio</th><th scope="col">Fin</th>
                  <th scope="col">Límite de ajustes</th><th scope="col">Fecha de pago</th>
                  <th scope="col">Estado</th><th scope="col">Pago</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((periodo) => {
                  const fechaPagoLlegada = fechaHoy >= String(periodo.FechaPago).slice(0, 10);
                  return (
                    <tr key={periodo.PeriodoId}>
                      <td>{formatDate(periodo.FechaInicio)}</td>
                      <td>{formatDate(periodo.FechaFin)}</td>
                      <td>{formatDate(periodo.FechaLimiteAjustes)}</td>
                      <td>{formatDate(periodo.FechaPago)}</td>
                      <td><span className={`status-badge period-status period-status--${periodo.Estado.toLowerCase()}`}>{estadoLabels[periodo.Estado] ?? periodo.Estado}</span></td>
                      <td>
                        {periodo.Estado === "CERRADO" ? (
                          <div className="period-row-payment">
                            <button type="button" className="button button-secondary" disabled={!fechaPagoLlegada || pagandoId !== null} onClick={() => onConfirmarPago(periodo)} aria-label={`Confirmar pago del período del ${formatDate(periodo.FechaInicio)} al ${formatDate(periodo.FechaFin)}`}>
                              <CheckCheck size={16} aria-hidden="true" /> {pagandoId === periodo.PeriodoId ? "Confirmando…" : "Confirmar pago"}
                            </button>
                            {!fechaPagoLlegada && <small>Disponible desde {formatDate(periodo.FechaPago)}</small>}
                          </div>
                        ) : <span className="muted">{periodo.Estado === "PAGADO" ? "Pago confirmado" : "Pendiente de cierre"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
