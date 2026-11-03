import { Link, NavLink } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext.jsx";
import FiltrosPlanilla from "../components/FiltrosPlanilla.jsx";
import InformacionPeriodo from "../components/InformacionPeriodo.jsx";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaDetallesPlanilla from "../components/TablaDetallesPlanilla.jsx";
import DetallePreplanillaModal from "../components/DetallePreplanillaModal.jsx";
import { getPeriodos } from "../../../services/periodos.Service.js";
import { getRestaurantes } from "../../../services/restaurantes.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import { calcularPreplanilla } from "../../../services/planillas.Service.js";

const emptyFilters = {
  restaurante: "todos",
  periodoId: null,
};

export default function PreplanillaPage() {
  const { user } = useAuth();
  const esGerente = user?.Rol === "GERENTE";
  const consultaRestaurante =
    user?.Rol === "ADMINISTRADOR" || user?.Rol === "RECURSOS_HUMANOS";

  const [filters, setFilters] = useState(emptyFilters);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState(null);

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
    (periodo) =>
      periodo.Estado === "ABIERTO" ||
      periodo.Estado === "EN_REVISION" ||
      periodo.Estado === "CERRADO",
  );

  const periodoSeleccionado = periodosDisponibles.find(
    (periodo) => periodo.PeriodoId === Number(filters.periodoId),
  );

  const periodoCerrado = periodosDisponibles.find(
    (periodo) => periodo.Estado === "CERRADO"
  );

  const {
    data: preplanillaData,
    isLoading: isLoadingPreplanilla,
    error: errorPreplanilla,
  } = useAsyncRequest(
    () =>
      periodoSeleccionado
        ? calcularPreplanilla(periodoSeleccionado.PeriodoId)
        : Promise.resolve(null),
    [periodoSeleccionado?.PeriodoId, filters.restaurante],
  );

  const preplanilla = preplanillaData ?? {};
  
  const detalles =
    periodoSeleccionado && !isLoadingPreplanilla && !errorPreplanilla
      ? (preplanilla.detallesCalculados ?? [])
      : [];

  console.log(preplanilla);
  useEffect(() => {
    setDetalleSeleccionado(null);
  }, [filters.periodoId, filters.restaurante, preplanillaData]);

  return (
    <div className="planillas-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> / <span>Planillas</span>
      </div>

      <header className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA DE REMUNERACIONES</p>
          <h1>Preplanilla</h1>
          <p>Consultá los ingresos estimados y el desglose del período.</p>
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

      <InformacionPeriodo periodo={periodoSeleccionado} />

      <ResumenPlanilla
        resumenGeneralPlanilla={preplanilla.resumenGeneralPlanilla}
        isLoading={isLoadingPreplanilla}
        error={errorPreplanilla}
      />

      <section aria-labelledby="preplanilla-detalles-titulo">
        <div className="planilla-section-heading">
          <h2 id="preplanilla-detalles-titulo">Detalle por colaborador</h2>
          <span>{detalles.length} colaboradores</span>
        </div>

        <TablaDetallesPlanilla
          detalles={detalles}
          restauranteId={esGerente ? user.RestauranteId : null}
          onVerConceptos={(detalle, nombre) =>
            setDetalleSeleccionado({ detalle, nombre })
          }
        />
      </section>

      <footer className="planilla-pie">
        <p className="planilla-nota">
          El registro de pago contempla el período completo y todos sus
          restaurantes.
        </p>
        {user?.Rol === "RECURSOS_HUMANOS" &&
          (periodoCerrado ? (
            <Link
              to={`/planillas/registrar-pago/${periodoCerrado.PeriodoId}`}
              className="button button-secondary"
            >
              Revisar período cerrado <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" className="button button-secondary" disabled>
              Revisar período cerrado <ArrowRight size={17} aria-hidden="true" />
            </button>
          ))}
      </footer>

      {detalleSeleccionado &&
        detalles.includes(detalleSeleccionado.detalle) && (
          <DetallePreplanillaModal
            detalle={detalleSeleccionado.detalle}
            nombre={detalleSeleccionado.nombre}
            onCerrar={() => setDetalleSeleccionado(null)}
          />
        )}
    </div>
  );
}
