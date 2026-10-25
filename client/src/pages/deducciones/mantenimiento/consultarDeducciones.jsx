import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ListFilter, Plus, ReceiptText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import { getDeducciones } from "../../../services/deducciones.Service.js";
import { obtenerFechaHoyCostaRica } from "../../../utils/fechaUtils.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";

const formatoPorcentaje = new Intl.NumberFormat("es-CR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function mostrarFecha(fecha) {
  if (!fecha) return "Sin fecha final";
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return [dia, mes, anio].join("/");
}

function estadoVigencia(deduccion, hoy) {
  const inicio = deduccion.FechaVigenciaInicio.slice(0, 10);
  const fin = deduccion.FechaVigenciaFin?.slice(0, 10) ?? null;
  if (hoy < inicio) return "Próxima";
  if (fin && hoy > fin) return "Finalizada";
  return "Vigente";
}

const filtrosVacios = { tipoDeduccion: "", fechaVigencia: "" };

export default function ConsultarDeducciones() {
  const { user } = useAuth();
  const esAdministrador = user?.Rol === "ADMINISTRADOR";
  const [filtrosFormulario, setFiltrosFormulario] = useState(filtrosVacios);
  const [filtrosAplicados, setFiltrosAplicados] = useState({});
  const { data, isLoading, error } = useAsyncRequest(
    () => getDeducciones(filtrosAplicados),
    [filtrosAplicados],
  );
  const deducciones = data ?? [];
  const hoy = obtenerFechaHoyCostaRica();

  function consultar(event) {
    event.preventDefault();
    setFiltrosAplicados({ ...filtrosFormulario });
  }

  function limpiarFiltros() {
    setFiltrosFormulario(filtrosVacios);
    setFiltrosAplicados({});
  }

  return (
    <div className="deducciones-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> / <span>Deducciones</span>
      </div>

      <div className="page-header deducciones-page-heading">
        <div>
          <p className="eyebrow accent">MANTENIMIENTO</p>
          <h1>Deducciones</h1>
          <p>Consultá los conceptos legales y adicionales del catálogo.</p>
        </div>
        {esAdministrador && (
          <Link className="button button-primary" to="/deducciones/crear">
            <Plus size={17} aria-hidden="true" /> Nuevo concepto
          </Link>
        )}
      </div>

      <section className="data-panel deducciones-filter-panel" aria-labelledby="deducciones-filtros-titulo">
        <div className="deducciones-section-heading">
          <div className="deducciones-section-icon">
            <ListFilter size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 id="deducciones-filtros-titulo">Buscar conceptos</h2>
            <p>Filtrá por tipo o por una fecha en que el concepto esté vigente.</p>
          </div>
        </div>
        <form className="deducciones-filtros" onSubmit={consultar}>
          <label htmlFor="deduccion-tipo">
            Tipo
            <select
              id="deduccion-tipo"
              value={filtrosFormulario.tipoDeduccion}
              onChange={(event) =>
                setFiltrosFormulario({
                  ...filtrosFormulario,
                  tipoDeduccion: event.target.value,
                })
              }
            >
              <option value="">Todos los tipos</option>
              <option value="LEGAL">Legal</option>
              <option value="ADICIONAL">Adicional</option>
            </select>
          </label>
          <label htmlFor="deduccion-vigencia">
            Vigentes al
            <input
              id="deduccion-vigencia"
              type="date"
              value={filtrosFormulario.fechaVigencia}
              onChange={(event) =>
                setFiltrosFormulario({
                  ...filtrosFormulario,
                  fechaVigencia: event.target.value,
                })
              }
            />
          </label>
          <div className="deducciones-filter-actions">
            <button className="button button-primary" type="submit">Consultar</button>
            <button className="button button-secondary" type="button" onClick={limpiarFiltros}>
              Limpiar
            </button>
          </div>
        </form>
      </section>

      <section className="data-panel deducciones-results-panel" aria-labelledby="deducciones-resultados-titulo">
        <div className="deducciones-results-heading">
          <div className="deducciones-section-icon">
            <ReceiptText size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 id="deducciones-resultados-titulo">Catálogo</h2>
            <p>{isLoading ? "Consultando conceptos..." : deducciones.length + " versiones encontradas"}</p>
          </div>
        </div>
        {isLoading ? (
          <LoadingState
            entidad="deducciones"
            mensaje="Cargando deducciones..."
            descripcion="Por favor, esperá mientras se cargan los conceptos."
          />
        ) : error ? (
          <AlertMessage title="No se pudieron cargar las deducciones">{error}</AlertMessage>
        ) : deducciones.length === 0 ? (
          <div className="empty-state">
            <h2>No se encontraron deducciones</h2>
            <p>Probá con otro tipo o fecha de vigencia.</p>
          </div>
        ) : (
          <div className="table-scroll" role="region" aria-label="Tabla de deducciones" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Porcentaje</th>
                  <th scope="col">Vigencia</th>
                  <th scope="col">Estado hoy</th>
                  {esAdministrador && <th scope="col">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {deducciones.map((deduccion) => {
                  const estado = estadoVigencia(deduccion, hoy);
                  return (
                    <tr key={deduccion.DeduccionId}>
                      <td className="deducciones-concepto">
                        <strong>{deduccion.Nombre}</strong>
                        <small>{deduccion.Codigo}</small>
                      </td>
                      <td>
                        <span
                          className={`deducciones-tipo deducciones-tipo--${
                            deduccion.TipoDeduccion === "LEGAL" ? "legal" : "adicional"
                          }`}
                        >
                          {deduccion.TipoDeduccion === "LEGAL" ? "Legal" : "Adicional"}
                        </span>
                      </td>
                      <td className="deducciones-porcentaje">
                        {deduccion.Porcentaje == null
                          ? "A elección del colaborador"
                          : formatoPorcentaje.format(deduccion.Porcentaje) + " %"}
                      </td>
                      <td className="deducciones-fecha">
                        <strong>{mostrarFecha(deduccion.FechaVigenciaInicio)}</strong>
                        <small>Hasta {mostrarFecha(deduccion.FechaVigenciaFin)}</small>
                      </td>
                      <td>
                        <span className={"status-badge status-badge--" +
                          (estado === "Vigente" ? "active" : "inactive")}>
                          <span /> {estado}
                        </span>
                      </td>
                      {esAdministrador && (
                        <td>
                          <Link className="button button-secondary deducciones-table-link"
                            to={"/deducciones/" + deduccion.DeduccionId}>
                            Gestionar <ArrowUpRight size={15} aria-hidden="true" />
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
