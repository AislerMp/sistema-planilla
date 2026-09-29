import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import SearchBar from "../../components/searchBar.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getPeriodos } from "../../services/periodos.Service.js";

const estadoLabels = {
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  PAGADO: "Pagado",
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`));
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export default function PeriodosPlanillaList() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const canManage = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(user?.Rol);
  const { data, isLoading, error } = useAsyncRequest(
    () => canManage ? getPeriodos() : Promise.resolve([]),
    [canManage],
  );
  const query = normalize(search.trim());
  const rows = (data ?? []).filter((periodo) =>
    [
      String(periodo.PeriodoId),
      periodo.Estado,
      estadoLabels[periodo.Estado] ?? periodo.Estado,
      periodo.FechaInicio,
      periodo.FechaFin,
      periodo.FechaLimiteAjustes,
      periodo.FechaPago,
      formatDate(periodo.FechaInicio),
      formatDate(periodo.FechaFin),
      formatDate(periodo.FechaPago),
      formatDate(periodo.FechaLimiteAjustes),
    ].some((value) => normalize(value).includes(query)),
  );

  return (
    <>
      <div className="breadcrumb">
        <Link to="/periodos">Periodos de planilla</Link> / <span>Mostrar periodos</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">ADMINISTRACIÓN</p>
          <h1>Mostrar periodos</h1>
          <p>Busca ciclos por número, estado o fechas.</p>
        </div>
        {canManage && (
          <Link className="button button-primary" to="/periodos/crear">
            <FilePlus2 size={18} /> Crear periodo
          </Link>
        )}
      </div>

      {!canManage ? (
        <AlertMessage title="Acceso restringido">
          Solo Recursos Humanos y Administración pueden consultar los periodos de planilla.
        </AlertMessage>
      ) : (
        <section className="data-panel" aria-label="Listado de periodos">
          <div className="table-toolbar">
            <SearchBar
              search={search}
              setSearch={setSearch}
              entidad="por fecha o estado"
              id="periodos-search"
            />
          </div>
          {isLoading ? (
            <LoadingState entidad="periodos" />
          ) : error ? (
            <div className="catalog-message">
              <AlertMessage title="No se pudieron cargar los periodos">{error}</AlertMessage>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <p>{data?.length ? "No hay periodos que coincidan con la búsqueda." : "Todavía no hay periodos registrados."}</p>
            </div>
          ) : (
            <div className="table-scroll" role="region" aria-label="Tabla de periodos" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Periodo</th>
                    <th scope="col">Inicio</th>
                    <th scope="col">Fin</th>
                    <th scope="col">Límite de ajustes</th>
                    <th scope="col">Fecha de pago</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((periodo) => (
                    <tr key={periodo.PeriodoId}>
                      <td>#{periodo.PeriodoId}</td>
                      <td>{formatDate(periodo.FechaInicio)}</td>
                      <td>{formatDate(periodo.FechaFin)}</td>
                      <td>{formatDate(periodo.FechaLimiteAjustes)}</td>
                      <td>{formatDate(periodo.FechaPago)}</td>
                      <td>
                        <span className={`status-badge period-status period-status--${periodo.Estado.toLowerCase()}`}>
                          {estadoLabels[periodo.Estado] ?? periodo.Estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-footer">
                <span>{rows.length} {rows.length === 1 ? "periodo" : "periodos"}</span>
                <Link to="/periodos"><ArrowLeft size={15} /> Volver al menú</Link>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
