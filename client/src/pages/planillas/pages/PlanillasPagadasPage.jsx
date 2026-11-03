import { Link, NavLink } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import FiltrosPlanilla from "../components/FiltrosPlanilla.jsx";
import InformacionPeriodo from "../components/InformacionPeriodo.jsx";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaDetallesPlanilla from "../components/TablaDetallesPlanilla.jsx";
import { useState } from "react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { getPeriodos } from "../../../services/periodos.Service.js";
import {
  getPlanillaConDetalles,
  getDetallesPlanillaRestaurante,
  getMisDetallesPlanilla,
  getPlanillas,
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

  
  console.log(detalles);
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
  console.log(planillas);

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
          </div>
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
    </div>
  );
}
