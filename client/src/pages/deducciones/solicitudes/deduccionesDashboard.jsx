import { Link } from "react-router-dom";
import { ArrowRight, FileText, Plus, ReceiptText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { useState } from "react";
import SolicitudesFiltros from "../../../components/SolicitudesFiltros.jsx";
import { getRestaurantes } from "../../../services/restaurantes.Service.js"
import { getSolicitudesDeduccionPorRestaurante, getMisSolicitudesDeduccion } from "../../../services/deducciones.Service.js"
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import { formatDate } from "../../../utils/fechaUtils.js";

const estadosDeducciones = [
  { valor: null, etiqueta: "Todas" },
  { valor: "PENDIENTE", etiqueta: "Pendientes" },
  { valor: "APROBADA", etiqueta: "Aprobadas" },
  { valor: "RECHAZADA", etiqueta: "Rechazadas" },
];

const etiquetasEstado = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const prioridadEstado = {
  PENDIENTE: 0,
  APROBADA: 1,
  RECHAZADA: 2,
};

const formatoPorcentaje = new Intl.NumberFormat("es-CR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const emptyFilter = {
  desde: "",
  hasta: "",
  estado: null,
  restauranteId: null,
};

export default function DeduccionesDashboard() {
  const { user } = useAuth();

  const esColaborador = user?.Rol === "COLABORADOR";
  const consultaRestaurante =
    user?.Rol === "ADMINISTRADOR" || user?.Rol === "RECURSOS_HUMANOS";

  const [filters, setFilters] = useState(emptyFilter);

  const {
    data: restaurantesData,
    error: restaurantesError,
    isLoading: cargandoRestaurantes,
  } = useAsyncRequest(
    () => consultaRestaurante ? getRestaurantes() : Promise.resolve([]),
    [consultaRestaurante],
  );

  const restaurantes = restaurantesData ?? [];

  const { data, error: solicitudesError, isLoading: cargandoSolicitudes } = useAsyncRequest(() => {
    return esColaborador
      ? getMisSolicitudesDeduccion(filters)
      : getSolicitudesDeduccionPorRestaurante(
          consultaRestaurante ? filters.restauranteId : null,
          filters,
        );
  }, [esColaborador, consultaRestaurante, filters]);

  const solicitudesDeducciones = [...(data ?? [])].sort(
    (a, b) => (prioridadEstado[a.Estado] ?? 3) - (prioridadEstado[b.Estado] ?? 3),
  );
  
  return (
    <div className="deduccion-solicitudes-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <span>Solicitudes de deducciones</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA Y SEGUIMIENTO</p>
          <h1>
            {esColaborador ? "Mis deducciones" : "Solicitudes de deducciones"}
          </h1>
          <p>
            Consultá los porcentajes solicitados y el resultado de Recursos
            Humanos.
          </p>
        </div>
        {esColaborador && (
          <Link
            className="button button-primary"
            to="/solicitudes-deducciones/nueva"
          >
            <Plus size={17} aria-hidden="true" /> Nueva solicitud
          </Link>
        )}
      </div>

      <section
        className="data-panel deduccion-solicitudes-intro"
        aria-label="Información del proceso"
      >
        <span className="deduccion-solicitudes-icon">
          <ReceiptText size={22} aria-hidden="true" />
        </span>
        <div>
          <h2>Deducciones adicionales</h2>
          <p>
            El colaborador elige el concepto y el porcentaje. Recursos Humanos
            revisa la solicitud antes de aplicarla.
          </p>
        </div>
      </section>

      <AlertMessage>{restaurantesError}</AlertMessage>
      <AlertMessage>{solicitudesError}</AlertMessage>
      <SolicitudesFiltros
        filtros={filters}
        onAplicar={setFilters}
        solicitudes={solicitudesDeducciones}
        restaurantes={restaurantes}
        isLoading={cargandoSolicitudes}
        error={solicitudesError}
        puedeConsultar={true}
        mostrarRestaurante={consultaRestaurante}
        cargandoRestaurantes={cargandoRestaurantes}
        errorRestaurantes={restaurantesError}
        estados={estadosDeducciones}
        etiquetaFecha="Inicio de aplicación desde"
        ariaLabel="Filtros de solicitudes de deducciones"
      />

      <section
        className="data-panel"
        aria-labelledby="deduccion-solicitudes-listado"
      >
        <div className="table-toolbar deduccion-solicitudes-table-heading">
          <div>
            <h2 id="deduccion-solicitudes-listado">Solicitudes registradas</h2>
            <p className="solicitud-create-note">
              Concepto, período de aplicación y estado de la revisión.
            </p>
          </div>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="Listado de solicitudes de deducciones"
          tabIndex={0}
        >
          <table aria-busy={cargandoSolicitudes}>
            <thead>
              <tr>
                <th scope="col">Solicitud</th>
                {!esColaborador && <th scope="col">Colaborador</th>}
                <th scope="col">Concepto</th>
                <th scope="col">Porcentaje</th>
                <th scope="col">Aplicación</th>
                <th scope="col">Estado</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargandoSolicitudes ? (
                <tr><td colSpan={esColaborador ? 6 : 7}><LoadingState entidad="solicitudes de deducciones" compacto /></td></tr>
              ) : solicitudesError ? (
                <tr><td colSpan={esColaborador ? 6 : 7} className="catalog-message">No se pudieron cargar las solicitudes.</td></tr>
              ) : solicitudesDeducciones.length === 0 ? (
                <tr><td colSpan={esColaborador ? 6 : 7} className="catalog-message">No hay solicitudes para estos filtros.</td></tr>
              ) : solicitudesDeducciones.map((solicitud) => (
                <tr key={solicitud.SolicitudId}>
                  <td>#{solicitud.SolicitudId}</td>
                  {!esColaborador && (
                    <td>
                      <strong>{[solicitud.Nombres, solicitud.Apellidos].filter(Boolean).join(" ") || `Colaborador #${solicitud.ColaboradorId}`}</strong>
                      <small className="deduccion-solicitudes-small">
                        {solicitud.Restaurante || `Restaurante #${solicitud.RestauranteId}`}
                      </small>
                    </td>
                  )}
                  <td>
                    <strong>{solicitud.NombreDeduccion}</strong>
                    <small className="deduccion-solicitudes-small">
                      {solicitud.Codigo}
                    </small>
                  </td>
                  <td>{formatoPorcentaje.format(solicitud.PorcentajeSolicitado)} %</td>
                  <td>{formatDate(solicitud.FechaInicio)} — {solicitud.FechaFin ? formatDate(solicitud.FechaFin) : "Sin fecha final"}</td>
                  <td>
                    <span
                      className="solicitud-state"
                      data-estado={solicitud.Estado}
                    >
                      {etiquetasEstado[solicitud.Estado] ?? solicitud.Estado}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="table-action-button"
                      to={"/solicitudes-deducciones/" + solicitud.SolicitudId}
                      aria-label={"Ver detalle de la solicitud " + solicitud.SolicitudId}
                    >
                      Ver detalle <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            <FileText size={14} aria-hidden="true" />{" "}
            {solicitudesDeducciones.length} solicitudes
          </span>
        </div>
      </section>
    </div>
  );
}
