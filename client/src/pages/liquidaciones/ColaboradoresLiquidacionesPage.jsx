import { useState } from "react";
import { Check, ChevronRight, RefreshCw, RotateCcw, Users } from "lucide-react";
import SearchBar from "../../components/searchBar.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { getColaboradores } from "../../services/colaboradores.Service.js";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import { getSaldoVacacionesByColaborador } from "../../services/vacaciones.Service.js";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { adaptarColaboradorLiquidacion } from "../../utils/liquidacionesUtils.js";
import {
  AvatarColaborador,
  EncabezadoLiquidaciones,
  FichaColaborador,
  nombreCompleto,
  normalizarBusqueda,
} from "./ComponentesLiquidacion.jsx";

export default function ColaboradoresLiquidacionesPage() {
  const [busqueda, setBusqueda] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const texto = normalizarBusqueda(busqueda);

  const {
    data: colaboradoresData,
    isLoading: isLoadingColaboradores,
    error: errorColaboradores,
  } = useAsyncRequest(
    () => getColaboradores({ restauranteId: restaurante }),
    [restaurante, reloadKey],
  );

  const colaboradores = errorColaboradores
    ? []
    : (colaboradoresData ?? []).map((persona) =>
        adaptarColaboradorLiquidacion(persona),
      );

  const {
    data: restaurantesData,
    isLoading: isLoadingRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(() => getRestaurantes(), [reloadKey]);
  const restaurantes = restaurantesData ?? [];

  const colaboradoresFiltrados = colaboradores.filter(
    (persona) =>
      persona.activo &&
      (!restaurante || String(persona.restauranteId) === restaurante) &&
      (normalizarBusqueda(nombreCompleto(persona)).includes(texto) ||
        normalizarBusqueda(persona.identificacion).includes(texto)),
  );

  const seleccionado =
    colaboradoresFiltrados.find((persona) => persona.id === seleccionadoId) ??
    colaboradoresFiltrados[0];

  const {
    data: saldo,
    isLoading: isLoadingSaldo,
    error: errorSaldo,
  } = useAsyncRequest(
    () =>
      seleccionado ? getSaldoVacacionesByColaborador(seleccionado.id) : null,
    [seleccionado?.id, reloadKey],
  );

  const fichaSeleccionada = seleccionado
    ? {
        ...seleccionado,
        vacacionesDisponibles: saldo?.DiasDisponibles ?? null,
      }
    : null;

  function cambiarBusqueda(valor) {
    setBusqueda(valor);
    setSeleccionadoId(null);
  }

  function limpiarFiltros() {
    setBusqueda("");
    setRestaurante("");
    setSeleccionadoId(null);
  }

  const hayFiltros = Boolean(busqueda || restaurante);
  const mensajeVacio = texto
    ? "No hay colaboradores que coincidan con la búsqueda."
    : restaurante
      ? "No hay colaboradores activos en este restaurante."
      : "No hay colaboradores activos disponibles para preparar una liquidación.";

  return (
    <div className="liquidaciones-page">
      <EncabezadoLiquidaciones
        titulo="Liquidaciones de personal"
        descripcion="Seleccioná un colaborador activo para preparar su liquidación"
      />

      <AlertMessage title="No se pudieron cargar los colaboradores">
        {errorColaboradores}
      </AlertMessage>

      <AlertMessage title="No se pudieron cargar los restaurantes">
        {errorRestaurantes}
      </AlertMessage>

      <div className="liquidacion-seleccion-layout">
        <section
          className="data-panel liquidacion-listado"
          aria-labelledby="liquidacion-colaboradores-titulo"
        >
          <div className="liquidacion-panel-titulo">
            <span className="planilla-icono">
              <Users size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 id="liquidacion-colaboradores-titulo">
                Colaboradores activos
              </h2>
              <p>Buscá y seleccioná a la persona que querés consultar.</p>
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={isLoadingColaboradores || isLoadingRestaurantes}
              onClick={() => setReloadKey((valor) => valor + 1)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Actualizar
            </button>
          </div>

          <div className="liquidacion-filtros-colaboradores">
            <SearchBar
              id="liquidacion-buscar-colaborador"
              entidad="colaborador"
              placeholder="Nombre o identificación"
              search={busqueda}
              setSearch={cambiarBusqueda}
            />

            <label htmlFor="liquidacion-restaurante">
              Restaurante
              <select
                id="liquidacion-restaurante"
                value={restaurante}
                disabled={isLoadingRestaurantes}
                onChange={(event) => {
                  setRestaurante(event.target.value);
                  setSeleccionadoId(null);
                }}
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
          </div>

          <div className="liquidacion-listado-cantidad" role="status">
            <span>
              {isLoadingColaboradores
                ? "Cargando colaboradores…"
                : errorColaboradores
                  ? "Listado no disponible"
                  : `${colaboradoresFiltrados.length} ${colaboradoresFiltrados.length === 1 ? "colaborador mostrado" : "colaboradores mostrados"}`}
            </span>
            {hayFiltros && (
              <button
                type="button"
                className="liquidacion-enlace"
                onClick={limpiarFiltros}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Limpiar filtros
              </button>
            )}
          </div>

          {isLoadingColaboradores ? (
            <LoadingState mensaje="Cargando colaboradores..." compacto />
          ) : (
            !errorColaboradores && (
              <div
                className="table-scroll"
                role="region"
                aria-label="Colaboradores para liquidar"
                tabIndex={0}
              >
                <table className="liquidacion-tabla liquidacion-tabla-colaboradores">
                  <thead>
                    <tr>
                      <th scope="col">Colaborador</th>
                      <th scope="col">Restaurante / puesto</th>
                      <th scope="col">
                        <span className="sr-only">Seleccionar colaborador</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {colaboradoresFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={3} className="liquidacion-tabla-vacia">
                          {mensajeVacio}
                        </td>
                      </tr>
                    )}
                    {colaboradoresFiltrados.map((persona) => (
                      <tr
                        key={persona.id}
                        className={
                          persona.id === seleccionado?.id
                            ? "liquidacion-fila-seleccionada"
                            : ""
                        }
                      >
                        <td>
                          <div className="liquidacion-persona-tabla">
                            <AvatarColaborador colaborador={persona} />
                            <div>
                              <strong>{nombreCompleto(persona)}</strong>
                              <small>{persona.identificacion}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {persona.restaurante}
                          <small>{persona.puesto}</small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button button-secondary liquidacion-seleccionar"
                            aria-label={`Seleccionar a ${nombreCompleto(persona)}`}
                            aria-pressed={persona.id === seleccionado?.id}
                            onClick={() => setSeleccionadoId(persona.id)}
                          >
                            {persona.id === seleccionado?.id ? (
                              <Check size={16} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={16} aria-hidden="true" />
                            )}
                            {persona.id === seleccionado?.id
                              ? "Seleccionado"
                              : "Seleccionar"}
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

        {isLoadingColaboradores ? (
          <aside
            className="data-panel liquidacion-ficha"
            aria-label="Cargando ficha del colaborador"
          >
            <LoadingState
              mensaje="Preparando la ficha..."
              descripcion="Esperando el listado de colaboradores."
              compacto
            />
          </aside>
        ) : (
          <FichaColaborador
            colaborador={fichaSeleccionada}
            cargandoVacaciones={isLoadingSaldo}
            errorVacaciones={errorSaldo}
          />
        )}
      </div>
    </div>
  );
}
