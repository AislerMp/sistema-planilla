import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import SolicitudesFiltros from "../../components/SolicitudesFiltros.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";

import {
  getMisIncapacidades,
  getIncapacidadesPorRestaurante,
} from "../../services/incapacidades.Services.js";

import { getRestaurantes } from "../../services/restaurantes.Service.js";
import { formatDate } from "../../utils/fechaUtils.js";

const estadosLabel = {
  PENDIENTE: "Pendiente",
  EN_REVISION_RH: "En revisión de RH",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

function obtenerDiferenciaDeFechas(fechaInicio, fechaFin) {
  // SQL DATE llega como ISO: conservar el día calendario sin desplazarlo a UTC-6.
  const fechaInicioF = new Date(
    `${String(fechaInicio).slice(0, 10)}T00:00:00Z`,
  );
  const fechaFinF = new Date(`${String(fechaFin).slice(0, 10)}T00:00:00Z`);

  const milisegundosPorDia = 24 * 60 * 60 * 1000;
  const diasDiferencia =
    (fechaFinF.getTime() - fechaInicioF.getTime()) / milisegundosPorDia;

  return diasDiferencia + 1;
}

export default function ConsultarIncapacidades() {
  const { user } = useAuth();
  const esColaborador = user?.Rol === "COLABORADOR";
  const esGerente = user?.Rol === "GERENTE";
  const puedeElegirRestaurante = ["ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(
    user?.Rol,
  );

  const [filters, setFilters] = useState({
    restauranteId: null,
    desde: "",
    hasta: "",
    estado: null,
  });

  const puedeConsultar =
    esColaborador ||
    esGerente ||
    (puedeElegirRestaurante && !!filters.restauranteId);

  const {
    data: restaurantesData,
    isLoading: cargandoRestaurantes,
    error: errorRestaurantes,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("activos") : Promise.resolve([]),
    [puedeElegirRestaurante],
  );
  const restaurantes = restaurantesData ?? [];

  const {
    data: incapacidadesData,
    isLoading,
    error: errorIncapacidades,
  } = useAsyncRequest(() => {
    if (!puedeConsultar) return Promise.resolve([]);

    return esColaborador
      ? getMisIncapacidades(filters)
      : getIncapacidadesPorRestaurante(
          esGerente ? null : filters.restauranteId,
          filters,
        );
  }, [esColaborador, esGerente, puedeConsultar, filters]);
  
  const incapacidades = incapacidadesData ?? [];
  const columnas = esColaborador ? 6 : 7;
  return (
    <div>
      <div className="breadcrumb">
        <Link to="/inicio"> Gestión de planilla</Link> /{" "}
        <span>Incapacidades</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA Y SEGUIMIENTO</p>
          <h1>Mis incapacidades</h1>
          <p>Consultá tus solicitudes y el avance de su revisión.</p>
        </div>

        <Link className="button button-primary" to="/incapacidades/registrar">
          <Plus size={17} aria-hidden="true" /> Registrar incapacidad
        </Link>
      </div>

      <AlertMessage>{errorIncapacidades}</AlertMessage>
      <SolicitudesFiltros
        filtros={filters}
        onAplicar={setFilters}
        solicitudes={incapacidades}
        isLoading={isLoading}
        error={errorIncapacidades}
        puedeConsultar={puedeConsultar}
        mostrarRestaurante={puedeElegirRestaurante}
        restauranteRequerido={puedeElegirRestaurante}
        restaurantes={restaurantes}
        cargandoRestaurantes={cargandoRestaurantes}
        errorRestaurantes={errorRestaurantes}
        etiquetaFecha="Fecha solicitada desde"
        ariaLabel="Filtros de incapacidades"
      />
      <section className="data-panel" aria-label="Solicitudes de incapacidad">
        <div
          className="table-scroll"
          role="region"
          aria-label="Listado de incapacidades"
          tabIndex={0}
        >
          <table aria-busy={isLoading}>
            <thead>
              <tr>
                {!esColaborador && <th scope="col">Colaborador</th>}
                <th scope="col">Fechas</th>
                <th scope="col">Días</th>
                <th scope="col">Tipo</th>
                <th scope="col">Documento</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!puedeConsultar ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    {puedeElegirRestaurante
                      ? "Seleccioná un restaurante y aplicá los filtros para consultar sus incapacidades."
                      : "No tenés permisos para consultar incapacidades."}
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={columnas}>
                    <LoadingState entidad="incapacidades" compacto />
                  </td>
                </tr>
              ) : errorIncapacidades ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    No se pudieron cargar las incapacidades.
                  </td>
                </tr>
              ) : incapacidades.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    No hay incapacidades para estos filtros.
                  </td>
                </tr>
              ) : (
                incapacidades.map((incapacidad) => {
                  const dias = obtenerDiferenciaDeFechas(
                    incapacidad.FechaInicio,
                    incapacidad.FechaFin,
                  );

                  return (
                    <tr key={incapacidad.SolicitudId}>
                      {!esColaborador && (
                        <td>
                          {incapacidad.Nombres} {incapacidad.Apellidos}
                        </td>
                      )}
                      <td>
                        {formatDate(incapacidad.FechaInicio)}
                        <br />
                        <small>al {formatDate(incapacidad.FechaFin)}</small>
                      </td>
                      <td>
                        {dias} {dias === 1 ? "día" : "días"}
                      </td>
                      <td>
                        {incapacidad.TipoSolicitud}
                      </td>
                      <td>{incapacidad.NumeroDocumento}</td>
                      <td>
                        <span
                          className="solicitud-state"
                          data-estado={incapacidad.Estado}
                        >
                          {estadosLabel[incapacidad.Estado] ??
                            incapacidad.Estado}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="table-action-button"
                          to={`/incapacidades/${incapacidad.SolicitudId}`}
                          aria-label={`Ver detalle de ${incapacidad.NumeroDocumento}`}
                        >
                          Ver detalle{" "}
                          <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {puedeConsultar && !isLoading && !errorIncapacidades && (
          <p className="table-footer">
            {incapacidades.length}{" "}
            {incapacidades.length === 1 ? "solicitud" : "solicitudes"}
          </p>
        )}
      </section>
    </div>
  );
}
