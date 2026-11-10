import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import {
  NavegacionAguinaldo,
  FiltrosAguinaldo,
  ResumenAguinaldo,
  TablaAguinaldo,
} from "./ComponentesAguinaldo.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import {
  calcularAguinaldo,
  confirmarAguinaldo,
} from "../../services/aguinaldos.Service.js";
import {
  confirmarCalculoAguinaldo,
  notifySuccess,
} from "../../utils/notifications.js";
import { obtenerFechaHoyCostaRica } from "../../utils/fechaUtils.js";

const formatoFecha = new Intl.DateTimeFormat("es-ES", {
  year: "numeric",
  month: "long",
  day: "numeric",
  // Son fechas de calendario del backend, no instantes en la zona del navegador.
  timeZone: "UTC",
});

function mostrarFecha(valor) {
  if (valor == null) return "—";
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "—" : formatoFecha.format(fecha);
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function AguinaldoActualPage() {
  const { user } = useAuth();
  const isColaborador = user?.Rol === "COLABORADOR";
  const isGerente = user?.Rol === "GERENTE";
  const isRecursosHumanos = user?.Rol === "RECURSOS_HUMANOS";
  const puedeElegirRestaurante =
    isRecursosHumanos || user?.Rol === "ADMINISTRADOR";

  const [restaurante, setRestaurante] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [confirmado, setConfirmado] = useState(false);
  const confirmacionEnCurso = useRef(false);

  const {
    data: restaurantesData,
    isLoading: isRestaurantesLoading,
    error: restaurantesError,
  } = useAsyncRequest(
    () =>
      puedeElegirRestaurante ? getRestaurantes("todos") : Promise.resolve([]),
    [puedeElegirRestaurante, reloadKey],
  );
  const restaurantes = (restaurantesData ?? []).map((item) => ({
    id: item.RestauranteId,
    nombre: item.Nombre,
  }));

  const anioActual = new Date().getFullYear();
  const {
    data: aguinaldoData,
    isLoading: isAguinaldoLoading,
    error: aguinaldoError,
  } = useAsyncRequest(
    () =>
      isColaborador || isGerente
        ? calcularAguinaldo(anioActual)
        : calcularAguinaldo(
            anioActual,
            restaurante === "todos" ? {} : { restauranteId: restaurante },
          ),
    [anioActual, restaurante, reloadKey, user?.Rol, user?.ColaboradorId],
  );
  const aguinaldo = aguinaldoData || {};

  const detalles = aguinaldoError ? [] : (aguinaldo.detalles ?? []);
  const resumenAguinaldo = {
    salarioAcumulado: Number(
      detalles
        .reduce((total, detalle) => total + Number(detalle.salarioAcumulado), 0)
        .toFixed(2),
    ),
    montoAguinaldo: aguinaldo.totalAguinaldo ?? 0,
    colaboradores: detalles.length,
  };

  const search = normalizarTexto(busqueda);
  const detallesAguinaldoFiltrados = detalles.filter((detalle) => {
    const nombreCompleto = normalizarTexto(
      [detalle.nombres, detalle.apellido1, detalle.apellido2].filter(Boolean).join(" "),
    );

    return (
      nombreCompleto.includes(search) ||
      String(detalle.colaboradorId).includes(search)
    );
  });

  const isLoading = isRestaurantesLoading || isAguinaldoLoading;

  const puedeConfirmar = Boolean(
    aguinaldo.fechaFin &&
    obtenerFechaHoyCostaRica() > aguinaldo.fechaFin.slice(0, 10),
  );

  const puedeRegistrar =
    isRecursosHumanos &&
    !isAguinaldoLoading &&
    !aguinaldoError &&
    !!aguinaldoData &&
    puedeConfirmar &&
    !confirmado;

  const fechaConfirmacion = aguinaldo.fechaFin
    ? new Date(aguinaldo.fechaFin)
    : null;
  if (fechaConfirmacion) {
    fechaConfirmacion.setUTCDate(fechaConfirmacion.getUTCDate() + 1);
  }

  function actualizarConsulta() {
    setError(null);
    setReloadKey((prev) => prev + 1);
  }

  async function confirmarCalculo() {
    if (confirmacionEnCurso.current || busy || !puedeRegistrar) return;

    confirmacionEnCurso.current = true;
    setError(null);

    try {
      if (!(await confirmarCalculoAguinaldo(anioActual))) return;
      setBusy(true);
      await confirmarAguinaldo(anioActual);
      setConfirmado(true);
      actualizarConsulta();
      notifySuccess("Aguinaldo confirmado correctamente.");
    } catch (err) {
      setError(
        err.message || "No se pudo confirmar el aguinaldo. Intentá de nuevo.",
      );
    } finally {
      setBusy(false);
      confirmacionEnCurso.current = false;
    }
  }

  return (
    <div className="aguinaldos-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> / <span>Aguinaldos</span>
      </div>
      <header className="page-header">
        <div>
          <p className="eyebrow accent">CÁLCULO ANUAL</p>
          <h1>Aguinaldo {anioActual}</h1>
          <p>
            Consultá el salario acumulado y el aguinaldo estimado de cada
            colaborador.
          </p>
        </div>
        <div className="aguinaldo-acciones">

          <button
            type="button"
            className="button button-secondary"
            onClick={actualizarConsulta}
            disabled={isLoading || busy}
          >
            <RefreshCw size={16} aria-hidden="true" /> Actualizar
          </button>

          {isRecursosHumanos && (
            <button
              type="button"
              className="button button-primary"
              onClick={confirmarCalculo}
              disabled={busy || !puedeRegistrar}
              aria-busy={busy}
            >
              {busy ? (
                <LoaderCircle
                  size={16}
                  className="loading-state-spinner"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck size={16} aria-hidden="true" />
              )}
              {busy
                ? "Registrando..."
                : confirmado
                  ? "Cálculo confirmado"
                  : "Confirmar cálculo"}
            </button>

          )}
        </div>
      </header>

      <NavegacionAguinaldo />

      <AlertMessage title="No se pudieron cargar los restaurantes">
        {restaurantesError}
      </AlertMessage>
      <AlertMessage title="No se pudo consultar el aguinaldo">
        {aguinaldoError}
      </AlertMessage>
      <AlertMessage
        title="No se pudo confirmar el aguinaldo"
        onClose={() => setError(null)}
      >
        {error}
      </AlertMessage>

      <FiltrosAguinaldo
        restaurantes={restaurantes}
        restaurante={restaurante}
        onRestauranteChange={setRestaurante}
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        user={user}
        isLoading={isLoading || busy}
      />

      {busy && (
        <LoadingState
          mensaje="Registrando el aguinaldo..."
          descripcion="Estamos guardando el cálculo anual completo."
          compacto
        />
      )}

      <div aria-busy={isAguinaldoLoading}>
        {isAguinaldoLoading ? (
          <div className="data-panel aguinaldo-carga">
            <LoadingState
              mensaje="Calculando aguinaldo..."
              descripcion="Consultando los ingresos del período anual."
              compacto
            />
          </div>
        ) : !aguinaldoError && aguinaldoData ? (
          <>
            <section
              className="data-panel aguinaldo-periodo"
              aria-label="Período considerado"
            >
              <span className="planilla-icono" aria-hidden="true">
                <CalendarDays size={21} />
              </span>
              <div>
                <p className="eyebrow">RANGO CONSIDERADO</p>
                <h2>
                  {mostrarFecha(aguinaldo.fechaInicio)} —{" "}
                  {mostrarFecha(aguinaldo.fechaFin)}
                </h2>
              </div>
              <span
                className={`aguinaldo-estado aguinaldo-estado--${confirmado ? "confirmado" : "curso"}`}
              >
                {confirmado ? "Confirmado" : "Estimación anual"}
              </span>
            </section>

            {confirmado ? (
              <AlertMessage type="success" title="Aguinaldo registrado">
                El cálculo anual quedó confirmado. Podés consultarlo en el
                histórico.
              </AlertMessage>
            ) : (
              !puedeConfirmar &&
              fechaConfirmacion && (
                <div className="aguinaldo-aviso">
                  <AlertMessage
                    type="info"
                    title="Fecha prevista de confirmación"
                  >
                    La confirmación del cálculo estará disponible a partir del{" "}
                    {mostrarFecha(fechaConfirmacion)}.
                  </AlertMessage>
                </div>
              )
            )}

            <ResumenAguinaldo
              resumen={resumenAguinaldo}
              historico={confirmado}
            />

            <section aria-labelledby="aguinaldo-actual-detalles">
              <div className="planilla-section-heading">
                <h2 id="aguinaldo-actual-detalles">
                  {confirmado
                    ? "Aguinaldo por colaborador"
                    : "Estimación por colaborador"}
                </h2>
                <span>
                  {detallesAguinaldoFiltrados.length} de {detalles.length}{" "}
                  colaboradores · Montos en colones
                </span>
              </div>
              <TablaAguinaldo
                detalles={detallesAguinaldoFiltrados}
                historico={confirmado}
                mensajeVacio={
                  search
                    ? "No hay colaboradores que coincidan con tu búsqueda."
                    : "No hay ingresos para calcular el aguinaldo en esta consulta."
                }
              />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
