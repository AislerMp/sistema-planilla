import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Database,
  Hash,
  UserRound,
} from "lucide-react";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { getBitacora } from "../../services/bitacora.Service.js";
import { fechaHoraFormat } from "../../utils/fechaUtils.js";
import { obtenerComparacionBitacora } from "../../utils/bitacoraUtils.js";

function nombreCampo(campo) {
  return campo
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (letra) => letra.toUpperCase());
}

function mostrarValor(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sin valor";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

export default function DetalleBitacora() {
  const { id } = useParams();

  const {
    data: bitacora,
    isLoading,
    error,
  } = useAsyncRequest(() => getBitacora(id), [id]);

  const { anteriores, nuevos, calculo } = obtenerComparacionBitacora(bitacora);
  const campos = Array.from(
    new Set([
      ...Object.keys(anteriores),
      ...Object.keys(nuevos),
    ]),
  );


  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Inicio</Link> /{" "}
        <Link to="/bitacoras">Bitácoras</Link> / <span>Detalle</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">HISTORIAL DEL SISTEMA</p>
          <h1>Detalle de bitácora #{id}</h1>
          <p>Revisá los datos anteriores y nuevos de esta acción.</p>
        </div>
        <Link className="button button-secondary" to="/bitacoras">
          <ArrowLeft size={17} /> Volver a bitácoras
        </Link>
      </div>
      {error && <AlertMessage>{error}</AlertMessage>}
      {isLoading ? (
        <LoadingState entidad="detalle de la bitácora" />
      ) : bitacora && (
      <div className="bitacora-detail-layout">
      <section
        className="data-panel bitacora-evento"
        aria-labelledby="bitacora-evento-titulo"
      >
        <div className="bitacora-evento-heading">
          <div>
            <p className="eyebrow">EVENTO REGISTRADO</p>
            <h2 id="bitacora-evento-titulo">Información del evento</h2>
          </div>
          <span className="bitacora-action-badge">
            <Activity size={15} aria-hidden="true" />
            {bitacora.Accion?.replaceAll("_", " ")}
          </span>
        </div>
        <dl>
          <div>
            <CalendarClock aria-hidden="true" />
            <span><dt>Fecha y hora</dt><dd><time dateTime={bitacora.FechaEvento}>{fechaHoraFormat.format(new Date(bitacora.FechaEvento))}</time></dd></span>
          </div>
          <div>
            <UserRound aria-hidden="true" />
            <span><dt>Usuario</dt><dd>{bitacora.NombreUsuario || "Usuario no disponible"}</dd></span>
          </div>
          <div>
            <Database aria-hidden="true" />
            <span><dt>Entidad</dt><dd>{bitacora.Entidad}</dd></span>
          </div>
          <div>
            <Hash aria-hidden="true" />
            <span><dt>Registro afectado</dt><dd>#{bitacora.RegistroId}</dd></span>
          </div>
        </dl>
        {["SolicitudesHorasExtras", "SolicitudesPermisosLaborales"].includes(bitacora.Entidad) && (
          <p>Referencia histórica anterior a la nueva estructura de solicitudes. El número identifica el registro original y no una solicitud actual.</p>
        )}
      </section>
      <section className="data-panel bitacora-cambios" aria-labelledby="bitacora-cambios-titulo">
        <div className="table-toolbar">
          <div>
            <h2 id="bitacora-cambios-titulo">Detalle de los cambios</h2>
            <p>Comparación de la información antes y después de la acción.</p>
          </div>
          <span className="bitacoras-results-count">{campos.length} campos</span>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="Comparación de datos"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col">Antes</th>
                <th scope="col">Después</th>
              </tr>
            </thead>
            <tbody>
              {campos.map(
                (campo) => (
                  <tr key={campo}>
                    <th scope="row">{nombreCampo(campo)}</th>
                    <td className="bitacora-value-before">{mostrarValor(anteriores[campo])}</td>
                    <td className="bitacora-value-after">{mostrarValor(nuevos[campo])}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
      {calculo && (
        <section className="data-panel bitacora-cambios" aria-labelledby="bitacora-calculo-titulo">
          <div className="table-toolbar">
            <div>
              <h2 id="bitacora-calculo-titulo">Cálculo de incapacidad registrado</h2>
              <p>Reconocimiento generado al aprobar esta solicitud.</p>
            </div>
          </div>
          <div className="table-scroll" role="region" aria-label="Cálculo registrado" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">Campo</th><th scope="col">Valor registrado</th></tr></thead>
              <tbody>
                {Object.entries(calculo).map(([campo, valor]) => (
                  <tr key={campo}>
                    <th scope="row">{nombreCampo(campo)}</th>
                    <td>{mostrarValor(valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </div>
      )}
    </>
  );
}
