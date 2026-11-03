import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getColaboradores } from "../../../services/colaboradores.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";

function currencyFormat(value) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
  }).format(value);
}

export default function TablaDetallesPlanilla({
  detalles = [],
  restauranteId = null,
  onVerConceptos,
}) {
  const tieneDetalles = detalles.length > 0;

  const requiereColaboradores = detalles.some((detalle) => detalle.DetallePlanillaId == null);

  const {
    data: colaboradoresData,
    isLoading: isLoadingColaboradores,
    error: errorColaboradores,
  } = useAsyncRequest(
    () => requiereColaboradores ? getColaboradores({ restauranteId }) : Promise.resolve([]),
    [restauranteId, requiereColaboradores],
  );

  const colaboradores = colaboradoresData ?? [];
  if (isLoadingColaboradores && requiereColaboradores) {
    return <LoadingState mensaje="Cargando colaboradores..." compacto />;
  }

  if (errorColaboradores && requiereColaboradores) {
    return (
      <AlertMessage title="No se pudieron cargar los colaboradores">
        {errorColaboradores}
      </AlertMessage>
    );
  }

  return (
    <div className="data-panel">
      <div
        className="table-scroll"
        role="region"
        aria-label="Detalles por colaborador"
        tabIndex={0}
      >
        <table className="planilla-tabla">
          <thead>
            <tr>
              <th scope="col">Colaborador</th>
              <th scope="col">Tarifa x Hora</th>
              <th scope="col">Restaurante</th>
              <th scope="col" className="planilla-numero">
                Ingresos
              </th>
              <th scope="col" className="planilla-numero">
                Deducciones
              </th>
              <th scope="col" className="planilla-numero">
                Neto
              </th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!tieneDetalles && (
              <tr><td colSpan={7}>No hay detalles de planilla para mostrar.</td></tr>
            )}
            {detalles.map((detalle) => {
              const detalleId = detalle.DetallePlanillaId;
              const colaboradorId = detalle.ColaboradorId ?? detalle.colaboradorId;
              const colaborador = colaboradores.find(
                (c) => c.ColaboradorId === Number(colaboradorId),
              );
              const nombre = detalle.ColaboradorNombre
                ? `${detalle.ColaboradorNombre} ${detalle.ColaboradorApellido ?? ""}`.trim()
                : colaborador
                  ? `${colaborador.Nombres} ${colaborador.Apellidos}`.trim()
                  : `Colaborador #${colaboradorId}`;

              return (
                <tr key={detalleId ?? colaboradorId}>
                  <td>
                    <strong>{nombre}</strong>
                    {colaborador?.NombrePuesto && <small>{colaborador.NombrePuesto}</small>}
                  </td>
                  <td>
                    {currencyFormat(detalle.TarifaHoraAplicada ?? detalle.tarifaHoraAplicada)}
                  </td>
                  <td>
                    {detalle.RestauranteNombre ?? colaborador?.NombreRestaurante ?? `Restaurante #${detalle.RestauranteId ?? detalle.restauranteId}`}
                  </td>
                  <td className="planilla-numero">
                    {currencyFormat(detalle.TotalIngresos ?? detalle.totalIngresos)}
                  </td>
                  <td className="planilla-numero">
                    {currencyFormat(detalle.TotalDeducciones ?? detalle.totalDeducciones)}
                  </td>
                  <td className="planilla-numero">
                    <strong>
                      {currencyFormat(detalle.TotalNeto ?? detalle.totalNeto)}
                    </strong>
                  </td>
                  <td>
                    {detalleId != null ? (
                      <Link
                        className="planilla-enlace"
                        to={`/planillas/detalle/${detalleId}`}
                        aria-label={`Ver detalle de ${nombre}`}
                      >
                        Ver detalle{" "}
                        <ChevronRight size={16} aria-hidden="true" />
                      </Link>
                    ) : onVerConceptos && Array.isArray(detalle.conceptos) ? (
                      <button
                        type="button"
                        className="planilla-enlace"
                        onClick={() => onVerConceptos(detalle, nombre)}
                        aria-label={`Ver conceptos de ${nombre}`}
                      >
                        Ver conceptos <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="planilla-nota">Sin registrar</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
