import { useState } from "react";
import TablaAsistencias from "../../components/TablaAsistencias.jsx";
import EditarHorasModal from "../../components/EditarHorasModal.jsx";
import ResumenPeriodo from "../../components/ResumenPeriodo.jsx";

import { Link } from "react-router-dom";
import { ArrowLeft, Filter, RotateCcw } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";

import { useAuth } from "../../context/AuthContext.jsx";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import { getPeriodos } from "../../services/periodos.Service.js";
import {
  getAsistenciasPorColaborador,
  getAsistenciasPorRestaurante,
} from "../../services/asistenciasDiarias.Service.js";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { formatDate, obtenerSemanas, etiquetaSemana } from "../../utils/fechaUtils.js";


const emptyFilters = {
  restauranteId: null,
  desde: "",
  hasta: "",
  periodoId: null,
};

export default function GestionarAsistencias() {
  const { user } = useAuth();
  const isColaborador = user?.Rol === "COLABORADOR";
  const isGerente = user?.Rol === "GERENTE";
  const puedeElegirRestaurante = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(
    user?.Rol,
  );

  const [form, setForm] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [filterError, setFilterError] = useState("");
  const [asistenciaSeleccionada, setAsistenciaSeleccionada] = useState(null);

  // Administracion y RR. HH. deben aplicar un restaurante antes de consultar.
  const puedeConsultar =
    !puedeElegirRestaurante || Boolean(filters.restauranteId);

  const [consultarPor, setConsultarPor] = useState({
    tipo: "Fechas",
  });
  
  const { data, isLoading, error } = useAsyncRequest(() => {
    if (!puedeConsultar) return Promise.resolve([]);

    return isColaborador
      ? getAsistenciasPorColaborador(filters)
      : getAsistenciasPorRestaurante(filters);
  }, [filters, puedeConsultar, isColaborador, user?.UsuarioId]);

  const asistenciasDiarias = data ?? [];

  const {
    data: restaurantesData,
    isLoading: loadingRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("activos") : Promise.resolve([]),
    [puedeElegirRestaurante, user?.UsuarioId],
  );

  const restaurantes = restaurantesData ?? [];

  const {
    data: periodosData,
    isLoading: isLoadingPeriodos,
    error: errorPeriodos,
  } = useAsyncRequest(getPeriodos, [user?.UsuarioId]);

  const periodos = periodosData ?? [];
  const periodoAplicado = periodos.find(
    (periodo) => Number(periodo.PeriodoId) === Number(filters.periodoId),
  );

  // Derivar las semanas despues de inicializar el catalogo asincrono.
  const periodoSeleccionado = periodos.find(
    (periodo) => Number(periodo.PeriodoId) === Number(form.periodoId),
  );

  const restauranteSeleccionado = puedeElegirRestaurante
    ? restaurantes.find((restaurante) => Number(restaurante.RestauranteId) === Number(form.restauranteId))?.Nombre
      || "Seleccioná un restaurante"
    : [...new Set(asistenciasDiarias
        .filter((asistencia) => Number(asistencia.PeriodoId) === Number(form.periodoId))
        .map((asistencia) => asistencia.Restaurante)
        .filter(Boolean))].join(", ");

  const semanas = obtenerSemanas(periodoSeleccionado);

  const semanaSeleccionada = semanas.findIndex(
    (semana) => semana.desde === form.desde && semana.hasta === form.hasta,
  );


  function handleFilters(e) {
    e.preventDefault();
    if (isLoading) return;
    if (form.desde && form.hasta && form.desde > form.hasta) {
      setFilterError("La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }

    setFilterError("");

    if (form.desde && form.hasta) {
      const dias =
        (Date.parse(form.hasta) - Date.parse(form.desde)) / 86400000 + 1;
      if (dias > 14) {
        setFilterError("El rango de fechas permite un máximo de 14 días.");
        return;
      }
    }

    if (consultarPor.tipo === "Planillas" && !periodoSeleccionado) {
      setFilterError("Selecciona un periodo.");
      return;
    }

    if (puedeElegirRestaurante && !form.restauranteId) {
      setFilterError("Selecciona un restaurante.");
      return;
    }

    // En modo Fechas no enviar el periodo de una seleccion anterior.
    setFilters({
      ...form,
      periodoId: consultarPor.tipo === "Planillas" ? form.periodoId : null,
    });
  }

  function clearFilters() {
    setConsultarPor({ tipo: "Fechas" });
    setForm(emptyFilters);
    setFilters({ ...emptyFilters });
    setFilterError("");
  }

  function onSeleccionarAsistencia(asistencia){
    setAsistenciaSeleccionada(asistencia);
  }

  return (
    <div className="asistencias-page">
      <div className="breadcrumb">
        <Link to="/asistencia">Marcas y asistencias</Link> /{" "}
        <span>
          {isColaborador
            ? "Gestión de asistencias"
            : "Administracion de asistencias"}
        </span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">
            {isColaborador
              ? "MI JORNADA"
              : isGerente
                ? "MI RESTAURANTE"
                : "ADMINISTRACIÓN"}
          </p>
          <h1>Gestión de asistencias</h1>
          <p>
            {isColaborador
              ? "Consultá tus horas trabajadas y extras por fecha o período."
              : "Consultá las horas trabajadas y extras de tu equipo."}
          </p>
        </div>
        <Link className="button button-secondary" to="/asistencia">
          <ArrowLeft size={17} aria-hidden="true" /> Volver al menú
        </Link>
      </div>

      {consultarPor.tipo === "Planillas" && (
        <ResumenPeriodo
          periodo={periodoSeleccionado}
          restaurante={restauranteSeleccionado}
        />
      )}

      <form
        className="catalog-form data-panel"
        onSubmit={handleFilters}
        aria-labelledby="marks-filters-title"
      >
        <h2 id="marks-filters-title">Filtros de asistencia</h2>
        <fieldset
          disabled={isLoading}
          aria-label="Filtros de asistencia"
          aria-busy={isLoading}
        >
          <label htmlFor="consultar">
            Consultar por
            <select
              id="consultar"
              name="tipo"
              value={consultarPor.tipo}
              onChange={(event) => {
                setConsultarPor({ tipo: event.target.value });
                // Los modos no comparten fechas ni periodo; conservar solo restaurante.
                setForm((actual) => ({
                  ...emptyFilters,
                  restauranteId: actual.restauranteId,
                }));
                setFilterError("");
              }}
            >
              <option value="Planillas">Periodo de planilla</option>
              <option value="Fechas">Periodo de fechas</option>
            </select>
          </label>

          {consultarPor.tipo === "Fechas" ? (
            <>
              <label htmlFor="marks-desde">
                Desde
                <input
                  id="marks-desde"
                  name="desde"
                  type="date"
                  value={form.desde}
                  max={form.hasta || undefined}
                  onChange={(event) => {
                    setForm({ ...form, desde: event.target.value });
                    setFilterError("");
                  }}
                />
              </label>
              <label htmlFor="marks-hasta">
                Hasta
                <input
                  id="marks-hasta"
                  name="hasta"
                  type="date"
                  value={form.hasta}
                  min={form.desde || undefined}
                  onChange={(event) => {
                    setForm({ ...form, hasta: event.target.value });
                    setFilterError("");
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <label htmlFor="periodoId">
                Periodo
                <select
                  id="periodoId"
                  name="periodoId"
                  value={form.periodoId ?? ""}
                  disabled={isLoadingPeriodos}
                  onChange={(event) => {
                    setFilterError("");
                    setForm({
                      ...form,
                      periodoId: event.target.value
                        ? Number(event.target.value)
                        : null,
                      desde: "",
                      hasta: "",
                    });
                  }}
                >
                  <option value="">
                    {isLoadingPeriodos
                      ? "Cargando periodos..."
                      : errorPeriodos
                        ? "No se pudieron cargar"
                        : periodos.length === 0
                          ? "No hay periodos disponibles"
                          : "Selecciona un periodo"}
                  </option>
                  {periodos.map((periodos) => (
                    <option key={periodos.PeriodoId} value={periodos.PeriodoId}>
                      {formatDate(periodos.FechaInicio)} -{" "}
                      {formatDate(periodos.FechaFin)}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="semana">
                Semana
                <select
                  id="semana"
                  name="semana"
                  disabled={!periodoSeleccionado}
                  value={
                    semanaSeleccionada === -1 ? "" : String(semanaSeleccionada)
                  }
                  onChange={(event) => {
                    setFilterError("");
                    const semana =
                      event.target.value === ""
                        ? null
                        : semanas[Number(event.target.value)];

                    setForm((actual) => ({
                      ...actual,
                      // Vacio significa todo el periodo: la API filtra solo por periodoId.
                      desde: semana?.desde ?? "",
                      hasta: semana?.hasta ?? "",
                    }));
                  }}
                >
                  {!periodoSeleccionado ? (
                    <option value="">Selecciona un periodo primero</option>
                  ) : (
                    <>
                      {semanas.map((semana, index) => (
                        <option key={semana.desde} value={String(index)}>
                          {etiquetaSemana(semana)}
                        </option>
                      ))}
                      <option value="">
                        {semanas.length === 2
                          ? "Las dos semanas"
                          : "Todo el periodo"}
                      </option>
                    </>
                  )}
                </select>
              </label>
            </>
          )}

          {puedeElegirRestaurante && (
            <label htmlFor="restauranteId">
              Restaurante
              <select
                id="restauranteId"
                value={form.restauranteId ?? ""}
                disabled={loadingRestaurantes}
                onChange={(event) => {
                  setFilterError("");
                  setForm({
                    ...form,
                    restauranteId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  });
                }}
              >
                <option value="">
                  {loadingRestaurantes
                    ? "Cargando restaurantes..."
                    : errorRestaurantes
                      ? "No se pudieron cargar"
                      : restaurantes.length === 0
                        ? "No hay restaurantes activos"
                        : "Selecciona un restaurante"}
                </option>
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
          )}
          <p className="muted">
            {consultarPor.tipo === "Planillas"
              ? "Selecciona una semana o todo el periodo. Los cambios se consultan al aplicar los filtros."
              : "Sin fechas se consulta la semana actual. El rango incluye ambos días y permite hasta 14 días."}
          </p>
          {errorRestaurantes && (
            <AlertMessage title="No se pudieron cargar los restaurantes">
              {errorRestaurantes}
            </AlertMessage>
          )}
          {consultarPor.tipo === "Planillas" && errorPeriodos && (
            <AlertMessage title="No se pudieron cargar los periodos">
              {errorPeriodos}
            </AlertMessage>
          )}
          {filterError && (
            <AlertMessage title="Revisa los filtros">
              {filterError}
            </AlertMessage>
          )}

          <div className="table-actions">
            <button
              type="submit"
              className="button button-primary"
            >
              <Filter size={17} aria-hidden="true" />{" "}
              {isLoading ? "Consultando..." : "Aplicar filtros"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={clearFilters}
            >
              <RotateCcw size={17} aria-hidden="true" /> Limpiar filtros
            </button>
          </div>
        </fieldset>
      </form>

      {!puedeConsultar ? (
        <AlertMessage type="info" title="Prepara tu consulta">
          Selecciona un restaurante y aplica los filtros para consultar sus
          asistencias.
        </AlertMessage>
      ) : isLoading ? (
        <LoadingState entidad="asistencias" />
      ) : error ? (
        <>
          <AlertMessage title="No se pudieron consultar las asistencias">
            {error}
          </AlertMessage>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setFilters((actual) => ({ ...actual }))}
          >
            <RotateCcw size={17} aria-hidden="true" /> Reintentar consulta
          </button>
        </>
      ) : asistenciasDiarias.length === 0 ? (
        <AlertMessage type="info" title="Sin asistencias">
          No hay registros para los filtros aplicados. Prueba otras fechas o un
          periodo diferente.
        </AlertMessage>
      ) : (
        <TablaAsistencias
          desde={filters.desde || periodoAplicado?.FechaInicio?.slice(0, 10)}
          hasta={filters.hasta || periodoAplicado?.FechaFin?.slice(0, 10)}
          asistencias={asistenciasDiarias}
          onSeleccionarAsistencia={isGerente ? onSeleccionarAsistencia : undefined}
        />
      )}
      {asistenciaSeleccionada && (
        <EditarHorasModal
          key={asistenciaSeleccionada.AsistenciaId}
          asistencia={asistenciaSeleccionada}
          onCerrar={() => setAsistenciaSeleccionada(null)}
          onActualizada={() => setFilters((actual) => ({ ...actual }))}
        />
      )}
    </div>
  );
}
