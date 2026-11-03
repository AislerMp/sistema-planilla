import { useEffect } from "react";
import AlertMessage from "../../../components/AlertMessage.jsx";
import { formatDate } from "../../../utils/fechaUtils.js";

export default function FiltrosPlanilla({
  user,
  periodos = [],
  restaurante = [],
  filters = {},
  isLoading = false,
  error,
  setFilters,
}) {
  const puedeElegirRestaurante =
    user?.Rol === "ADMINISTRADOR" || user?.Rol === "RECURSOS_HUMANOS";
  const periodoAbiertoId = periodos.find((p) => p.Estado === "ABIERTO")?.PeriodoId;

  useEffect(() => {
    if (periodoAbiertoId == null || filters.periodoId != null) return;

    setFilters((prev) => prev.periodoId != null
      ? prev
      : { ...prev, periodoId: String(periodoAbiertoId) });
  }, [periodoAbiertoId, filters.periodoId, setFilters]);

  return (
    <section
      className="data-panel catalog-form planilla-filtros"
      aria-label="Filtros de planillas"
    >
      <AlertMessage title="No se pudieron cargar los filtros">{error}</AlertMessage>
      <div className="planilla-campos">
        <label htmlFor="planilla-periodo">
          Período de planilla
          <select
            id="planilla-periodo"
            disabled={isLoading || !!error || periodos.length === 0}
            value={filters.periodoId ?? ""}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, periodoId: e.target.value }))
            }
          >
            <option value="">
              {isLoading ? "Cargando períodos..." : periodos.length === 0 ? "No hay períodos disponibles" : "Seleccioná un período"}
            </option>
            {periodos.map((p) => (
              <option key={p.PeriodoId} value={p.PeriodoId}>
                {formatDate(p.FechaInicio)} – {formatDate(p.FechaFin)} · {p.Estado}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="planilla-restaurante">
          Restaurante
          <select
            id="planilla-restaurante"
            value={filters.restaurante ?? "todos"}
            disabled={isLoading || !!error || !puedeElegirRestaurante}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, restaurante: e.target.value }))
            }
          >
            <option value="todos">{puedeElegirRestaurante ? "Todos los restaurantes" : "Tu restaurante asignado"}</option>
            {isLoading && <option disabled>Cargando...</option>}
            {error && <option disabled>Error al cargar</option>}
            {!isLoading &&
              !error &&
              puedeElegirRestaurante && restaurante.map((r) => (
                <option key={r.RestauranteId} value={r.RestauranteId}>
                  {r.Nombre}
                </option>
              ))}
          </select>
        </label>
      </div>
    </section>
  );
}
