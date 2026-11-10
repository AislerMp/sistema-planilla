import { useId } from "react";
import { NavLink } from "react-router-dom";
import SearchBar from "../../components/SearchBar.jsx";

const formatoMoneda = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
});

export function NavegacionAguinaldo() {
  return (
    <nav
      className="planilla-tabs aguinaldo-tabs"
      aria-label="Secciones de aguinaldos"
    >
      <NavLink to="/aguinaldos" end>
        Cálculo anual
      </NavLink>
      <NavLink to="/aguinaldos/historico">Histórico</NavLink>
    </nav>
  );
}

export function FiltrosAguinaldo({
  restaurantes,
  restaurante,
  onRestauranteChange,
  busqueda,
  onBusquedaChange,
  anio,
  onAnioChange,
  anios,
  user,
  isLoading = false,
}) {
  const id = useId();
  const puedeElegirRestaurante =
    user?.Rol === "RECURSOS_HUMANOS" || user?.Rol === "ADMINISTRADOR";

  return (
    <section
      className="data-panel catalog-form aguinaldo-filtros"
      aria-label="Filtros de aguinaldos"
    >
      <div
        className={`aguinaldo-campos${anios && puedeElegirRestaurante ? " aguinaldo-campos--historico" : ""}${!anios && !puedeElegirRestaurante ? " aguinaldo-campos--solo-busqueda" : ""}`}
      >
        {anios && (
          <label htmlFor={`${id}-anio`}>
            Año
            <select
              id={`${id}-anio`}
              value={anio}
              disabled={isLoading || anios.length === 0}
              onChange={(event) => onAnioChange(event.target.value)}
            >
              {anios.length === 0 && (
                <option value="">{isLoading ? "Cargando años..." : "Sin años disponibles"}</option>
              )}
              
              <option value="">Seleccione un año</option>
              
              {anios.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </label>
        )}

        {puedeElegirRestaurante && (
          <label htmlFor={`${id}-restaurante`}>
            Restaurante
            <select
              id={`${id}-restaurante`}
              value={restaurante}
              disabled={isLoading}
              onChange={(event) => onRestauranteChange(event.target.value)}
            >
              <option value="todos">Todos los restaurantes</option>
              {restaurantes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <SearchBar
          id={`${id}-busqueda`}
          entidad="colaborador"
          placeholder="Nombre o identificación del colaborador"
          search={busqueda}
          setSearch={onBusquedaChange}
        />
      </div>
    </section>
  );
}

export function ResumenAguinaldo({ resumen, historico = false }) {
  return (
    <section className="planilla-resumen" aria-label="Resumen del aguinaldo">
      <article className="data-panel planilla-importe">
        <h2>Salario acumulado</h2>
        <p>Importe del período anual</p>
        <strong>{formatoMoneda.format(resumen.salarioAcumulado)}</strong>
      </article>
      <article className="data-panel planilla-importe planilla-importe--neto">
        <h2>{historico ? "Total de aguinaldo" : "Aguinaldo estimado"}</h2>
        <p>{historico ? "Importe confirmado" : "Consulta preliminar"}</p>
        <strong>{formatoMoneda.format(resumen.montoAguinaldo)}</strong>
      </article>
      <article className="data-panel planilla-importe">
        <h2>Colaboradores</h2>
        <p>Incluidos en el período anual</p>
        <strong>{resumen.colaboradores}</strong>
      </article>
    </section>
  );
}

export function TablaAguinaldo({
  detalles,
  historico = false,
  mensajeVacio = "No hay detalles de aguinaldo para mostrar.",
}) {
  return (
    <div className="data-panel aguinaldo-tabla-panel">
      <div
        className="table-scroll"
        role="region"
        aria-label="Aguinaldo por colaborador"
        tabIndex={0}
      >
        <table className="planilla-tabla aguinaldo-tabla">
          <thead>
            <tr>
              <th scope="col">Colaborador</th>
              <th scope="col">Restaurante</th>
              <th scope="col" className="planilla-numero">
                Salario acumulado
              </th>
              <th scope="col" className="planilla-numero">
                {historico ? "Monto del aguinaldo" : "Aguinaldo estimado"}
              </th>
            </tr>
          </thead>
          <tbody>
            {detalles.length === 0 && (
              <tr>
                <td colSpan={4}>{mensajeVacio}</td>
              </tr>
            )}
            {detalles.map((detalle) => (
              <tr key={detalle.id ?? detalle.colaboradorId}>
                <td>
                  <strong>{[detalle.nombres, detalle.apellido1, detalle.apellido2].filter(Boolean).join(" ")}</strong>
                  <small>{detalle.identificacion ?? detalle.colaboradorId}</small>
                </td>
                <td>{detalle.restaurante}</td>
                <td className="planilla-numero">
                  {formatoMoneda.format(detalle.salarioAcumulado)}
                </td>
                <td className="planilla-numero">
                  <strong>
                    {formatoMoneda.format(detalle.montoAguinaldo)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

