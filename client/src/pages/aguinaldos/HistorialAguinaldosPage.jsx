import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { getDetallesAguinaldo } from "../../services/aguinaldos.Service.js";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import { formatDate } from "../../utils/fechaUtils.js";
import {
  NavegacionAguinaldo,
  FiltrosAguinaldo,
  ResumenAguinaldo,
  TablaAguinaldo,
} from "./ComponentesAguinaldo.jsx";

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function HistorialAguinaldosPage() {
  const { user } = useAuth();
  const puedeElegirRestaurante =
    user?.Rol === "RECURSOS_HUMANOS" || user?.Rol === "ADMINISTRADOR";
  const [anio, setAnio] = useState("");
  const [restaurante, setRestaurante] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // El servidor limita este historial al colaborador o restaurante de la sesión.
  const {
    data: historialData,
    isLoading: isHistorialLoading,
    error: historialError,
  } = useAsyncRequest(
    () => getDetallesAguinaldo(),
    [user?.Rol, user?.ColaboradorId, reloadKey],
  );

  const {
    data: restaurantesData,
    isLoading: isRestaurantesLoading,
    error: restaurantesError,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("todos") : Promise.resolve([]),
    [puedeElegirRestaurante, reloadKey],
  );

  const historial = historialError ? [] : (historialData ?? []);

  const anios = [
    ...new Set(historial.map((detalle) => Number(detalle.Anio))),
  ].sort((primero, segundo) => segundo - primero);

  const anioSeleccionado = anios.includes(Number(anio))
    ? Number(anio)
    : null;

  const restaurantes = (restaurantesData ?? []).map((item) => ({
    id: item.RestauranteId,
    nombre: item.Nombre,
  }));

  const textoBusqueda = normalizarTexto(busqueda);

  const detalles = historial
    .filter((detalle) => {

      const coincideAnio = Number(detalle.Anio) === anioSeleccionado;

      const coincideRestaurante =
        !puedeElegirRestaurante ||
        restaurante === "todos" ||
        String(detalle.RestauranteId) === restaurante;

      const nombre = normalizarTexto(
        [detalle.Nombres, detalle.Apellido1, detalle.Apellido2].filter(Boolean).join(" "),
      );

      const coincideBusqueda =
        nombre.includes(textoBusqueda) ||
        normalizarTexto(detalle.Identificacion).includes(textoBusqueda) ||
        String(detalle.ColaboradorId).includes(textoBusqueda);
        
      return coincideAnio && coincideRestaurante && coincideBusqueda;
    })
    .map((detalle) => ({
      id: detalle.DetalleAguinaldoId,
      colaboradorId: detalle.ColaboradorId,
      nombres: detalle.Nombres,
      apellido1: detalle.Apellido1,
      apellido2: detalle.Apellido2,
      identificacion: detalle.Identificacion,
      restaurante: detalle.Restaurante,
      salarioAcumulado: Number(detalle.SalarioAcumulado),
      montoAguinaldo: Number(detalle.MontoAguinaldo),
    }));

  // Sumar los importes ya registrados; no se recalcula el aguinaldo histórico.
  const resumen = {
    salarioAcumulado: Number(
      detalles
        .reduce((total, detalle) => total + detalle.salarioAcumulado, 0)
        .toFixed(2),
    ),
    montoAguinaldo: Number(
      detalles
        .reduce((total, detalle) => total + detalle.montoAguinaldo, 0)
        .toFixed(2),
    ),
    colaboradores: detalles.length,
  };

  const isLoading = isHistorialLoading || isRestaurantesLoading;

  function actualizarHistorial() {
    setReloadKey((valor) => valor + 1);
  }

  return (
    <div className="aguinaldos-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> / <span>Aguinaldos</span>
      </div>
      <header className="page-header">
        <div>
          <p className="eyebrow accent">REGISTROS ANUALES</p>
          <h1>Histórico de aguinaldos</h1>
          <p>
            Consultá los importes registrados y el detalle individual de cada
            aguinaldo.
          </p>
        </div>
        <div className="aguinaldo-acciones">
          <button
            type="button"
            className="button button-secondary"
            onClick={actualizarHistorial}
            disabled={isLoading}
          >
            <RefreshCw size={16} aria-hidden="true" /> Actualizar
          </button>
        </div>
      </header>

      <NavegacionAguinaldo />

      <FiltrosAguinaldo
        restaurantes={restaurantes}
        restaurante={restaurante}
        onRestauranteChange={setRestaurante}
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        anio={anioSeleccionado ?? ""}
        onAnioChange={setAnio}
        anios={anios}
        user={user}
        isLoading={isLoading}
      />

      <AlertMessage title="No se pudo cargar el histórico de aguinaldos">
        {historialError}
      </AlertMessage>
      <AlertMessage title="No se pudieron cargar los restaurantes">
        {restaurantesError}
      </AlertMessage>

      {isHistorialLoading ? (
        <LoadingState mensaje="Cargando histórico de aguinaldos..." compacto />
      ) : !historialError && anioSeleccionado != null ? (
        <>
          <section
            className="data-panel aguinaldo-periodo"
            aria-label="Período registrado"
          >
            <span className="planilla-icono" aria-hidden="true">
              <CalendarDays size={21} />
            </span>
            <div>
              <p className="eyebrow">AGUINALDO {anioSeleccionado}</p>
              <h2>
                {formatDate(`${anioSeleccionado - 1}-12-01`)} —{" "}
                {formatDate(`${anioSeleccionado}-11-30`)}
              </h2>
            </div>
            <span className="aguinaldo-estado aguinaldo-estado--confirmado">
              Confirmado
            </span>
          </section>

          <ResumenAguinaldo resumen={resumen} historico />

          <section aria-labelledby="aguinaldo-historico-detalles">
            <div className="planilla-section-heading">
              <h2 id="aguinaldo-historico-detalles">
                Aguinaldos por colaborador
              </h2>
              <span>Montos en colones</span>
            </div>
            <TablaAguinaldo detalles={detalles} historico />
          </section>
        </>
      ) : (
        !historialError && (
          <AlertMessage type="info" title="Sin aguinaldos confirmados">
            No hay registros de aguinaldo disponibles para tu consulta.
          </AlertMessage>
        )
      )}
    </div>
  );
}
