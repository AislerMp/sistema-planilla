import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import AlertMessage from "./AlertMessage.jsx";

const emptyFilters = {
  restauranteId: null,
  desde: "",
  hasta: "",
  estado: null,
};

const estadosSolicitud = [
  { valor: null, etiqueta: "Todas" },
  { valor: "PENDIENTE", etiqueta: "Pendientes" },
  { valor: "APROBADA", etiqueta: "Aprobadas" },
  { valor: "RECHAZADA", etiqueta: "Rechazadas" },
];

export default function SolicitudesFiltros({
  filtros,
  onAplicar,
  solicitudes,
  isLoading,
  error,
  puedeConsultar,
  mostrarRestaurante = false,
  restauranteRequerido = false,
  restaurantes = [],
  cargandoRestaurantes = false,
  errorRestaurantes = null,
  etiquetaFecha = "Fecha solicitada desde",
  ariaLabel = "Filtros de solicitudes",
}) {
  const id = useId();
  
  const [filtrosFormulario, setFiltrosFormulario] = useState({
    ...emptyFilters,
    ...filtros,
  });
  const [errorFiltro, setErrorFiltro] = useState(null);

  function aplicarFiltros(event) {
    event.preventDefault();
    if (isLoading) return;

    if (
      filtrosFormulario.desde &&
      filtrosFormulario.hasta &&
      filtrosFormulario.desde > filtrosFormulario.hasta
    ) {
      setErrorFiltro("La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }
    if (restauranteRequerido && !filtrosFormulario.restauranteId) {
      setErrorFiltro("Selecciona un restaurante.");
      return;
    }

    setErrorFiltro(null);
    onAplicar({ ...filtrosFormulario });
  }

  function limpiarFiltros() {
    const filtrosVacios = { ...emptyFilters };
    setFiltrosFormulario(filtrosVacios);
    setErrorFiltro(null);
    onAplicar(filtrosVacios);
  }

  return (
    <>
      <AlertMessage>{errorFiltro}</AlertMessage>
      <form
        className="solicitudes-filters data-panel"
        onSubmit={aplicarFiltros}
        aria-label={ariaLabel}
      >
        <div
          className="solicitudes-status-tabs"
          role="group"
          aria-label="Estado de las solicitudes"
        >
          {estadosSolicitud.map(({ valor, etiqueta }) => (
            <button
              key={valor ?? "todas"}
              type="button"
              className="solicitudes-status-tab"
              aria-pressed={filtrosFormulario.estado === valor}
              onClick={() =>
                setFiltrosFormulario((current) => ({ ...current, estado: valor }))
              }
            >
              {etiqueta}
              <span className="solicitudes-status-count">
                {isLoading || error || !puedeConsultar
                  ? "—"
                  : valor === null
                    ? solicitudes.length
                    : solicitudes.filter((solicitud) => solicitud.Estado === valor)
                        .length}
              </span>
            </button>
          ))}
        </div>
        <fieldset
          disabled={isLoading}
          aria-label="Fechas y restaurante"
          aria-busy={isLoading}
        >
          <label htmlFor={`${id}-desde`}>
            {etiquetaFecha}
            <input
              id={`${id}-desde`}
              name="desde"
              type="date"
              value={filtrosFormulario.desde}
              max={filtrosFormulario.hasta || undefined}
              onChange={(event) =>
                setFiltrosFormulario((current) => ({
                  ...current,
                  desde: event.target.value,
                }))
              }
            />
          </label>
          <label htmlFor={`${id}-hasta`}>
            Hasta
            <input
              id={`${id}-hasta`}
              name="hasta"
              type="date"
              value={filtrosFormulario.hasta}
              min={filtrosFormulario.desde || undefined}
              onChange={(event) =>
                setFiltrosFormulario((current) => ({
                  ...current,
                  hasta: event.target.value,
                }))
              }
            />
          </label>
          {mostrarRestaurante && (
            <label
              className="solicitudes-restaurante"
              htmlFor={`${id}-restaurante`}
            >
              Restaurante
              <select
                id={`${id}-restaurante`}
                value={filtrosFormulario.restauranteId ?? ""}
                disabled={cargandoRestaurantes}
                onChange={(event) => {
                  setErrorFiltro(null);
                  setFiltrosFormulario((current) => ({
                    ...current,
                    restauranteId: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }));
                }}
              >
                <option value="">
                  {cargandoRestaurantes
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
          <div className="solicitudes-filter-actions">
            <button className="button button-secondary" type="submit">
              Aplicar filtros
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={limpiarFiltros}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
