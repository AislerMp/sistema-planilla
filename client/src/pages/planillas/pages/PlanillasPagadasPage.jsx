import { Link, NavLink } from "react-router-dom";
import { ChevronRight, Printer } from "lucide-react";
import { createPortal } from "react-dom";
import FiltrosPlanilla from "../components/FiltrosPlanilla.jsx";
import InformacionPeriodo from "../components/InformacionPeriodo.jsx";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaDetallesPlanilla from "../components/TablaDetallesPlanilla.jsx";
import TablaConceptosPlanilla from "../components/TablaConceptosPlanilla.jsx";
import { useState } from "react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { getPeriodos } from "../../../services/periodos.Service.js";
import {
  getPlanillaConDetalles,
  getDetallesPlanillaRestaurante,
  getMisDetallesPlanilla,
  getPlanillas,
  getConceptosPlanilla,
} from "../../../services/planillas.Service.js";
import { getRestaurantes } from "../../../services/restaurantes.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import { formatDate } from "../../../utils/fechaUtils.js";

const emptyFilters = {
  restaurante: "todos",
  periodoId: null,
};

export default function PlanillasPagadasPage() {
  const { user } = useAuth();
  const consultaRestaurante =
    user?.Rol === "ADMINISTRADOR" || user?.Rol === "RECURSOS_HUMANOS";
  const esColaborador = user?.Rol === "COLABORADOR";

  const [filters, setFilters] = useState(emptyFilters);

  const {
    data,
    isLoading: isLoadingRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(
    () => (consultaRestaurante ? getRestaurantes() : Promise.resolve([])),
    [consultaRestaurante],
  );
  const restaurantes = data ?? [];

  const {
    data: periodosData,
    isLoading: isLoadingPeriodos,
    error: errorPeriodos,
  } = useAsyncRequest(getPeriodos, []);
  const periodos = periodosData ?? [];

  const periodosDisponibles = periodos.filter(
    (periodo) => periodo.Estado === "PAGADO" || periodo.Estado === "CERRADO",
  );

  const periodoSeleccionado = periodosDisponibles.find(
    (periodo) => periodo.PeriodoId === Number(filters.periodoId),
  );

  const {
    data: planillasPagadasData,
    isLoading: isLoadingPlanillasPagadas,
    error: errorPlanillasPagadas,
  } = useAsyncRequest(() => {
    if (!periodoSeleccionado) return Promise.resolve(null);

    return consultaRestaurante
      ? getPlanillaConDetalles(
          periodoSeleccionado.PeriodoId,
          filters.restaurante,
        )
      : user?.Rol === "GERENTE"
        ? getDetallesPlanillaRestaurante(periodoSeleccionado.PeriodoId)
        : getMisDetallesPlanilla(periodoSeleccionado.PeriodoId);
  }, [periodoSeleccionado?.PeriodoId, filters.restaurante, user?.Rol]);

  // RH/Admin reciben { planilla, detalles }; gerente, un arreglo; colaborador, un objeto.
  const detalles =
    !periodoSeleccionado ||
    isLoadingPlanillasPagadas ||
    errorPlanillasPagadas ||
    !planillasPagadasData
      ? []
      : consultaRestaurante
        ? planillasPagadasData.detalles
        : user?.Rol === "GERENTE"
          ? planillasPagadasData
          : [planillasPagadasData];

  // Los totales deben corresponder a los detalles visibles, incluso al filtrar restaurante.
  const resumenGeneralPlanilla = {
    totalIngresos: detalles.reduce(
      (sum, detalle) => sum + Number(detalle.TotalIngresos),
      0,
    ),
    totalDeducciones: detalles.reduce(
      (sum, detalle) => sum + Number(detalle.TotalDeducciones),
      0,
    ),
    totalNeto: detalles.reduce(
      (sum, detalle) => sum + Number(detalle.TotalNeto),
      0,
    ),
  };

  const puedeMostrarPago =
    periodoSeleccionado &&
    !isLoadingPlanillasPagadas &&
    !errorPlanillasPagadas &&
    planillasPagadasData;

  const {
    data: planillasData,
    isLoading: isLoadingPlanillas,
    error: errorPlanillas,
  } = useAsyncRequest(() => {
    return consultaRestaurante ? getPlanillas() : Promise.resolve([]);
  }, [consultaRestaurante]);
  const planillas = planillasData ?? [];

  const detalleIndividual = esColaborador ? detalles[0] : null;
  const {
    data: conceptosData,
    isLoading: isLoadingConceptos,
    error: errorConceptos,
  } = useAsyncRequest(() => {
    if (periodoSeleccionado?.Estado !== "PAGADO" || !detalleIndividual) return [];
    return detalleIndividual.conceptos ?? getConceptosPlanilla(detalleIndividual.DetallePlanillaId);
  }, [periodoSeleccionado?.Estado, detalleIndividual?.DetallePlanillaId]);
  const conceptos = conceptosData ?? [];

  const puedeImprimir =
    periodoSeleccionado?.Estado === "PAGADO" && detalles.length > 0 &&
    !isLoadingPeriodos && !errorPeriodos &&
    !isLoadingRestaurantes && !errorRestaurantes &&
    (!esColaborador || (!isLoadingConceptos && !errorConceptos && conceptos.length > 0));
  const alcanceImpresion = consultaRestaurante && filters.restaurante === "todos"
    ? "General · Todos los restaurantes"
    : detalles[0]?.RestauranteNombre ?? "Restaurante asignado";
  // FechaPago del período es programada; solo la planilla tiene el pago registrado.
  const fechaPagoRegistrada = planillasPagadasData?.planilla?.FechaPago;

  return (
    <div className="planillas-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <span>Planillas pagadas</span>
      </div>

      <header className="page-header">
        <div>
          <p className="eyebrow accent">HISTORIAL DE PAGOS</p>
          <h1>Planillas pagadas</h1>
          <p>
            Consultá los períodos registrados y los pagos de cada colaborador.
          </p>
        </div>
      </header>

      <nav className="planilla-tabs" aria-label="Secciones de planillas">
        <NavLink to="/planillas" end>
          Preplanilla
        </NavLink>
        <NavLink to="/planillas/pagadas">Planillas pagadas</NavLink>
      </nav>

      <FiltrosPlanilla
        restaurante={restaurantes}
        user={user}
        filters={filters}
        setFilters={setFilters}
        isLoading={isLoadingRestaurantes || isLoadingPeriodos}
        periodos={periodosDisponibles}
        error={errorRestaurantes || errorPeriodos}
      />

      <section aria-labelledby="pagadas-historial-titulo">
        <div className="planilla-section-heading">
          <h2 id="pagadas-historial-titulo">Historial de pagos</h2>
        </div>

        {isLoadingPlanillasPagadas && periodoSeleccionado && (
          <LoadingState mensaje="Cargando planilla pagada..." compacto />
        )}
        <AlertMessage title="No se pudo cargar la planilla pagada">
          {periodoSeleccionado ? errorPlanillasPagadas : null}
        </AlertMessage>
        {isLoadingPeriodos ? (
          <p className="planilla-nota">Cargando períodos...</p>
        ) : (
          periodosDisponibles.length === 0 && (
            <p className="planilla-nota">
              "No hay períodos pagados disponibles. Un período cerrado todavía
              no tiene el pago registrado."
            </p>
          )
        )}

        {consultaRestaurante && (
          <div className="data-panel">
            <div
              className="table-scroll"
              role="region"
              aria-label="Planillas pagadas por período"
              tabIndex={0}
            >
              <table className="planilla-tabla">
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col" className="planilla-numero">
                      Bruto pagado
                    </th>
                    <th scope="col" className="planilla-numero">
                      Deducciones
                    </th>
                    <th scope="col" className="planilla-numero">
                      Neto pagado
                    </th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planillas.map((planilla) => {
                    const periodoActual = periodosDisponibles.find(
                      (periodo) => periodo.PeriodoId === planilla.PeriodoId,
                    );

                    if (!periodoActual) return null;

                    return (
                      <tr key={planilla.PeriodoId}>
                        <td>
                          <strong>
                            {formatDate(periodoActual.FechaInicio)} –{" "}
                            {formatDate(periodoActual.FechaFin)}
                          </strong>
                          <small>
                            P-
                            {String(periodoActual.PeriodoId).padStart(
                              4,
                              "0",
                            )}{" "}
                            · Pagada
                          </small>
                        </td>
                        <td className="planilla-numero">
                          <strong>
                            {new Intl.NumberFormat("es-CR", {
                              style: "currency",
                              currency: "CRC",
                            }).format(planilla.TotalIngresos)}
                          </strong>
                        </td>
                        <td className="planilla-numero">
                          <strong>
                            {new Intl.NumberFormat("es-CR", {
                              style: "currency",
                              currency: "CRC",
                            }).format(planilla.TotalDeducciones)}
                          </strong>
                        </td>
                        <td className="planilla-numero">
                          <strong>
                            {new Intl.NumberFormat("es-CR", {
                              style: "currency",
                              currency: "CRC",
                            }).format(planilla.TotalNeto)}
                          </strong>
                        </td>
                        <td>
                          <button
                            onClick={() => setFilters((prev) => ({ ...prev, periodoId: planilla.PeriodoId }))}
                            className="planilla-enlace"
                          >
                            Ver planilla{" "}
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      
      {puedeMostrarPago && (
        <section
          id="planilla-pagada-detalle"
          className="planilla-pagada-ejemplo"
          aria-labelledby="pagada-ejemplo-titulo"
        >
          <div className="planilla-section-heading">
            <h2 id="pagada-ejemplo-titulo">Composición de la planilla</h2>
            <span>
              P-{String(periodoSeleccionado.PeriodoId).padStart(4, "0")}
            </span>
            {puedeImprimir && (
              <button type="button" className="button button-secondary" onClick={() => window.print()}>
                <Printer size={17} aria-hidden="true" />
                Imprimir / Guardar como PDF
              </button>
            )}
          </div>
          {esColaborador && isLoadingConceptos && (
            <LoadingState mensaje="Preparando comprobante de pago..." compacto />
          )}
          <AlertMessage title="No se pudo preparar el comprobante para imprimir">
            {esColaborador ? errorConceptos : null}
          </AlertMessage>
          <InformacionPeriodo periodo={periodoSeleccionado} />

          <ResumenPlanilla
            resumenGeneralPlanilla={resumenGeneralPlanilla}
            tituloIngresos="Ingresos pagados"
            tituloNeto="Neto pagado"
          />

          <div className="planilla-section-heading">
            <h2>Pagos por colaborador</h2>
            <span>{detalles.length} colaboradores</span>
          </div>
          <TablaDetallesPlanilla detalles={detalles} />
        </section>
      )}
      {puedeImprimir && createPortal(
        <section className="planilla-impresion" aria-label="Reporte de planilla pagada">
          <header className="planilla-impresion-encabezado">
            <div>
              <p className="planilla-impresion-marca">Gestión de planilla</p>
              <h1>{esColaborador ? "Comprobante de pago" : "Reporte de pagos"}</h1>
              <p>{esColaborador ? "Detalle de ingresos y deducciones" : "Pagos registrados por colaborador"}</p>
            </div>
            <div className="planilla-impresion-referencia">
              <span>Período pagado</span>
              <strong>P-{String(periodoSeleccionado.PeriodoId).padStart(4, "0")}</strong>
              {esColaborador && <small>Comprobante #{detalleIndividual.DetallePlanillaId}</small>}
            </div>
          </header>

          <dl className="planilla-impresion-datos">
            {esColaborador && (
              <div className="planilla-impresion-persona">
                <dt>Colaborador</dt>
                <dd>{[detalleIndividual.ColaboradorNombre, detalleIndividual.ColaboradorApellido1, detalleIndividual.ColaboradorApellido2].filter(Boolean).join(" ")}</dd>
              </div>
            )}
            <div>
              <dt>{esColaborador ? "Restaurante" : "Alcance"}</dt>
              <dd>{alcanceImpresion}</dd>
            </div>
            <div>
              <dt>Período</dt>
              <dd>{formatDate(periodoSeleccionado.FechaInicio)} – {formatDate(periodoSeleccionado.FechaFin)}</dd>
            </div>
            {fechaPagoRegistrada && (
              <div><dt>Fecha de pago registrada</dt><dd>{formatDate(fechaPagoRegistrada)}</dd></div>
            )}
          </dl>

          <h2 className="planilla-impresion-titulo">{esColaborador ? "Conceptos del pago" : "Pagos por colaborador"}</h2>
          {esColaborador
            ? <TablaConceptosPlanilla conceptos={conceptos} />
            : <TablaDetallesPlanilla detalles={detalles} />}

          <div className="planilla-impresion-totales">
            <h2 className="planilla-impresion-titulo">{esColaborador ? "Resumen del comprobante" : "Totales del alcance seleccionado"}</h2>
            <ResumenPlanilla
              resumenGeneralPlanilla={resumenGeneralPlanilla}
              tituloIngresos="Salario bruto"
              tituloNeto="Neto pagado"
            />
          </div>
          <footer className="planilla-impresion-pie">
            <span>Importes guardados al registrar la planilla · Montos en colones (CRC).</span>
            {!esColaborador && <strong>{detalles.length} {detalles.length === 1 ? "colaborador" : "colaboradores"}</strong>}
          </footer>
        </section>,
        document.body,
      )}
    </div>
  );
}
