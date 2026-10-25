import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Plus, Send } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import Dialog from "../../components/dialog.jsx";
import LoadingState from "../../components/loadingState.jsx";
import SolicitudesFiltros from "../../components/SolicitudesFiltros.jsx";
import { formatDate } from "../../utils/fechaUtils.js";
import {
  getMisVacaciones,
  getVacacionesPorRestaurante,
  getMiSaldoVacaciones,
  solicitarVacaciones,
} from "../../services/vacaciones.Service.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { notifySuccess } from "../../utils/notifications.js";
import { ordenarSolicitudesPorEstado } from "../../utils/solicitudUtils.js";

const formSolicitudVacio = { fechaInicio: "", fechaFin: "", motivo: "" };

const estadosLabel = {
  PENDIENTE: "Pendiente",
  EN_REVISION_RH: "En revisión de RH",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

export default function VacacionesDashboard() {
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

  const [isBusy, setIsBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [formSolicitud, setFormSolicitud] = useState(formSolicitudVacio);
  const envioEnCurso = useRef(false);

  // RH y Administración también pueden consultar sin filtrar restaurante.
  const puedeConsultar = esColaborador || esGerente || puedeElegirRestaurante;

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
    data: vacacionesData,
    isLoading,
    error: errorVacaciones,
  } = useAsyncRequest(() => {
    if (!puedeConsultar) return Promise.resolve([]);

    return esColaborador
      ? getMisVacaciones(filters)
      : getVacacionesPorRestaurante(
          esGerente ? null : filters.restauranteId,
          filters,
        );
  }, [esColaborador, esGerente, puedeConsultar, filters, reloadKey]);

  const vacaciones = ordenarSolicitudesPorEstado(vacacionesData, user?.Rol);

  const columnas = esColaborador ? 6 : 7;

  const {
    data: saldo,
    isLoading: isLoadingSaldo,
    error: errorSaldo,
  } = useAsyncRequest(
    () => (esColaborador ? getMiSaldoVacaciones() : Promise.resolve(null)),
    [esColaborador, user?.ColaboradorId, filters, reloadKey],
  );

  // Las fechas representan días calendario; se cuentan ambos extremos en UTC.
  const diasSolicitados =
    formSolicitud.fechaInicio && formSolicitud.fechaFin
      ? Math.floor(
          (new Date(`${formSolicitud.fechaFin}T00:00:00Z`) -
            new Date(`${formSolicitud.fechaInicio}T00:00:00Z`)) /
            86_400_000,
        ) + 1
      : 0;

  function abrirSolicitud() {
    if (!esColaborador || isBusy || envioEnCurso.current) return;
    setFormSolicitud(formSolicitudVacio);
    setError(null);
    setDialog({ tipo: "crear" });
  }

  function cerrarDialog() {
    if (isBusy || envioEnCurso.current) return;
    setError(null);
    setDialog(null);
  }

  async function enviarSolicitud(event) {
    event.preventDefault();
    if (!esColaborador || isBusy || envioEnCurso.current) return;

    setError(null);
    if (!formSolicitud.fechaInicio || !formSolicitud.fechaFin) {
      setError("Seleccioná la fecha de inicio y la fecha de fin.");
      return;
    }
    if (!Number.isInteger(diasSolicitados) || diasSolicitados <= 0) {
      setError(
        "La fecha de fin debe ser igual o posterior a la fecha de inicio.",
      );
      return;
    }
    if (isLoadingSaldo || errorSaldo || !saldo) {
      setError(
        "No se puede enviar la solicitud sin consultar el saldo disponible.",
      );
      return;
    }
    if (diasSolicitados > Number(saldo.DiasDisponibles)) {
      setError("Los días solicitados superan tu saldo disponible.");
      return;
    }

    const motivo = formSolicitud.motivo.trim();
    if (motivo.length > 500) {
      setError("El motivo no puede superar los 500 caracteres.");
      return;
    }

    envioEnCurso.current = true;
    setIsBusy(true);

    try {
      await solicitarVacaciones({
        fechaInicio: formSolicitud.fechaInicio,
        fechaFin: formSolicitud.fechaFin,
        motivo,
      });

      setFormSolicitud(formSolicitudVacio);
      setDialog(null);
      setReloadKey((current) => current + 1);
      notifySuccess("Solicitud de vacaciones enviada a gerencia.");
    } catch (requestError) {
      setError(
        requestError.message || "No se pudo enviar la solicitud de vacaciones.",
      );
    } finally {
      envioEnCurso.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div className="incapacidad-detail">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> / <span>Vacaciones</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">CONSULTA Y SEGUIMIENTO</p>
          <h1>Vacaciones</h1>
          <p>
            Consultá tu saldo, solicitá días de descanso y seguí su revisión.
          </p>
        </div>
        {esColaborador && (
          <button
            className="button button-primary"
            type="button"
            aria-haspopup="dialog"
            onClick={abrirSolicitud}
            disabled={isBusy}
          >
            <Plus size={17} aria-hidden="true" /> Nueva solicitud
          </button>
        )}
      </div>

      {esColaborador && (
        <section
          className="data-panel catalog-form"
          aria-labelledby="vacaciones-saldo-titulo"
        >
          <div className="incapacidad-resumen-heading">
            <div>
              <p className="eyebrow accent">TU DESCANSO</p>
              <h2 id="vacaciones-saldo-titulo">Saldo de vacaciones</h2>
            </div>
          </div>
          {isLoadingSaldo ? (
            <LoadingState entidad="saldo de vacaciones" compacto />
          ) : errorSaldo ? (
            <AlertMessage title="No se pudo cargar el saldo de vacaciones">
              {errorSaldo}
            </AlertMessage>
          ) : !saldo ? (
            <AlertMessage type="info" title="Saldo no disponible">
              No se encontró un saldo de vacaciones para el colaborador.
            </AlertMessage>
          ) : (
            <dl className="solicitud-details incapacidad-periodo">
              <div>
                <dt>Días acumulados</dt>
                <dd>
                  <CalendarDays size={18} aria-hidden="true" />{" "}
                  {saldo.DiasAcumulados} días
                </dd>
              </div>
              <div>
                <dt>Días utilizados</dt>
                <dd>{saldo.DiasUtilizados} días</dd>
              </div>
              <div>
                <dt>Días disponibles</dt>
                <dd className="accent">{saldo.DiasDisponibles} días</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      <AlertMessage title="No se pudieron cargar las vacaciones">
        {errorVacaciones}
      </AlertMessage>
      <AlertMessage title="No se pudieron cargar los restaurantes">
        {errorRestaurantes}
      </AlertMessage>
      <SolicitudesFiltros
        filtros={filters}
        onAplicar={setFilters}
        solicitudes={vacaciones}
        isLoading={isLoading}
        error={errorVacaciones}
        puedeConsultar={puedeConsultar}
        mostrarRestaurante={puedeElegirRestaurante}
        restaurantes={restaurantes}
        cargandoRestaurantes={cargandoRestaurantes}
        errorRestaurantes={errorRestaurantes}
        etiquetaFecha="Vacaciones desde"
        ariaLabel="Filtros de vacaciones"
      />

      <section
        className="data-panel"
        aria-labelledby="vacaciones-listado-titulo"
      >
        <div className="table-toolbar">
          <div>
            <h2 id="vacaciones-listado-titulo">Solicitudes de vacaciones</h2>
            <p className="solicitud-create-note">
              Fechas solicitadas y avance de la revisión.
            </p>
          </div>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="Listado de vacaciones"
          tabIndex={0}
        >
          <table aria-busy={isLoading}>
            <thead>
              <tr>
                <th scope="col">Solicitud</th>
                {!esColaborador && <th scope="col">Colaborador</th>}
                <th scope="col">Restaurante</th>
                <th scope="col">Fechas</th>
                <th scope="col">Días</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!puedeConsultar ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    No tenés permisos para consultar vacaciones.
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={columnas}>
                    <LoadingState entidad="vacaciones" compacto />
                  </td>
                </tr>
              ) : errorVacaciones ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    No se pudieron cargar las solicitudes de vacaciones.
                  </td>
                </tr>
              ) : vacaciones.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className="catalog-message">
                    No hay solicitudes de vacaciones para estos filtros.
                  </td>
                </tr>
              ) : (
                vacaciones.map((solicitud) => (
                  <tr key={solicitud.SolicitudId}>
                    <td>#{solicitud.SolicitudId}</td>
                    {!esColaborador && (
                      <td>
                        {solicitud.Colaborador ||
                          [solicitud.Nombres, solicitud.Apellidos]
                            .filter(Boolean)
                            .join(" ") ||
                          `Colaborador #${solicitud.ColaboradorId}`}
                      </td>
                    )}
                    <td>
                      {solicitud.Restaurante ||
                        restaurantes.find(
                          (restaurante) =>
                            restaurante.RestauranteId ===
                            solicitud.RestauranteId,
                        )?.Nombre ||
                        `Restaurante #${solicitud.RestauranteId}`}
                    </td>
                    <td>
                      {formatDate(solicitud.FechaInicio)}
                      <br />
                      <small>al {formatDate(solicitud.FechaFin)}</small>
                    </td>
                    <td>{solicitud.DiasSolicitados} días</td>
                    <td>
                      <span
                        className="solicitud-state"
                        data-estado={solicitud.Estado}
                      >
                        {estadosLabel[solicitud.Estado] ?? solicitud.Estado}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="table-action-button"
                        to={`/vacaciones/${solicitud.SolicitudId}`}
                        aria-label={`Ver detalle de la solicitud ${solicitud.SolicitudId}`}
                      >
                        Ver detalle <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {puedeConsultar && !isLoading && !errorVacaciones && (
          <p className="table-footer">
            {vacaciones.length}{" "}
            {vacaciones.length === 1 ? "solicitud" : "solicitudes"}
          </p>
        )}
      </section>

      {dialog?.tipo === "crear" && esColaborador && (
        <Dialog
          titulo="Nueva solicitud de vacaciones"
          subtitulo="Seleccioná las fechas de tu descanso."
          ocupado={isBusy}
          onCerrar={cerrarDialog}
        >
          <form className="solicitud-create-form" onSubmit={enviarSolicitud}>
            <fieldset disabled={isBusy} aria-busy={isBusy}>
              <legend className="sr-only">Datos de la nueva solicitud</legend>
              <label htmlFor="vacaciones-fecha-inicio">
                Fecha de inicio
                <input
                  id="vacaciones-fecha-inicio"
                  name="fechaInicio"
                  type="date"
                  required
                  autoFocus
                  value={formSolicitud.fechaInicio}
                  onChange={(event) =>
                    setFormSolicitud((current) => ({
                      ...current,
                      fechaInicio: event.target.value,
                    }))
                  }
                />
              </label>
              <label htmlFor="vacaciones-fecha-fin">
                Fecha de fin
                <input
                  id="vacaciones-fecha-fin"
                  name="fechaFin"
                  type="date"
                  required
                  min={formSolicitud.fechaInicio || undefined}
                  value={formSolicitud.fechaFin}
                  onChange={(event) =>
                    setFormSolicitud((current) => ({
                      ...current,
                      fechaFin: event.target.value,
                    }))
                  }
                />
              </label>
              <label htmlFor="vacaciones-motivo">
                Motivo (opcional)
                <textarea
                  id="vacaciones-motivo"
                  name="motivo"
                  rows={4}
                  maxLength={500}
                  placeholder="Información adicional para la revisión"
                  value={formSolicitud.motivo}
                  onChange={(event) =>
                    setFormSolicitud((current) => ({
                      ...current,
                      motivo: event.target.value,
                    }))
                  }
                />
              </label>
              <dl className="solicitud-details" aria-live="polite">
                <div>
                  <dt>Días por solicitar</dt>
                  <dd>
                    {diasSolicitados > 0 ? `${diasSolicitados} días` : "— días"}
                  </dd>
                </div>
                <div>
                  <dt>Saldo disponible</dt>
                  <dd>
                    {isLoadingSaldo
                      ? "Cargando…"
                      : errorSaldo || !saldo
                        ? "No disponible"
                        : `${saldo.DiasDisponibles} días`}
                  </dd>
                </div>
              </dl>
              {errorSaldo && (
                <AlertMessage title="No se pudo cargar el saldo de vacaciones">
                  {errorSaldo}
                </AlertMessage>
              )}
              <p className="solicitud-create-note">
                La solicitud quedará pendiente de revisión por tu gerente antes
                de pasar a Recursos Humanos.
              </p>
              <AlertMessage>{error}</AlertMessage>
              <footer className="solicitud-create-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={cerrarDialog}
                >
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={isBusy || isLoadingSaldo || !!errorSaldo || !saldo}
                >
                  <Send size={16} aria-hidden="true" />{" "}
                  {isBusy ? "Enviando…" : "Enviar a gerencia"}
                </button>
              </footer>
            </fieldset>
          </form>
        </Dialog>
      )}  
    </div>
  );
}
