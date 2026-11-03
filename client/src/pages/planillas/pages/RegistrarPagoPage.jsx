import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCheck } from "lucide-react";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import InformacionPeriodo from "../components/InformacionPeriodo.jsx";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaDetallesPlanilla from "../components/TablaDetallesPlanilla.jsx";
import ConfirmarPagoModal from "../components/ConfirmarPagoModal.jsx";
import DetallePreplanillaModal from "../components/DetallePreplanillaModal.jsx";
import { calcularPreplanilla } from "../../../services/planillas.Service.js";
import { getPeriodo } from "../../../services/periodos.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import { obtenerFechaHoyCostaRica } from "../../../utils/fechaUtils.js";
import { notifySuccess } from "../../../utils/notifications.js";

export default function RegistrarPagoPage() {
  const { periodoId } = useParams();
  const navigate = useNavigate();
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [detalleSeleccionado, setDetalleSeleccionado] = useState(null);

  const { data, isLoading, error } = useAsyncRequest(async () => {
    const periodo = await getPeriodo(periodoId);
    const preplanilla =
      periodo.Estado === "CERRADO"
        ? await calcularPreplanilla(periodoId)
        : null;
    return { periodo, preplanilla };
  }, [periodoId]);

  const periodo = data?.periodo;
  const detalles = data?.preplanilla?.detallesCalculados ?? [];
  const resumenGeneralPlanilla = data?.preplanilla?.resumenGeneralPlanilla;

  const cantidadRestaurantes = new Set(
    detalles.map((detalle) => detalle.restauranteId),
  ).size;
  
  const fechaPago = periodo?.FechaPago?.slice(0, 10);
  const llegoFechaPago = fechaPago && obtenerFechaHoyCostaRica() >= fechaPago;
  const puedeRegistrar =
    periodo?.Estado === "CERRADO" && detalles.length > 0 && llegoFechaPago;

  useEffect(() => {
    setDetalleSeleccionado(null);
  }, [periodoId, data]);

  function pagoRegistrado() {
    setMostrarConfirmacion(false);
    navigate("/planillas/pagadas", { replace: true });
    notifySuccess("Pago de planilla registrado correctamente.");
  }

  return (
    <div className="planillas-page">
      <Link className="planilla-volver" to="/planillas">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a preplanilla
      </Link>

      <header className="page-header">
        <div>
          <p className="eyebrow accent">RECURSOS HUMANOS</p>
          <h1>Registrar pago</h1>
          <p>Revisá el período completo antes de confirmar su pago.</p>
        </div>
      </header>

      {isLoading ||
      (!error && periodo && periodo.PeriodoId !== Number(periodoId)) ? (
        <LoadingState mensaje="Cargando el período y calculando la preplanilla..." />
      ) : error ? (
        <AlertMessage title="No se pudo cargar la planilla">
          {error}
        </AlertMessage>
      ) : !periodo ? (
        <AlertMessage title="Período no disponible">
          No se encontró el período solicitado.
        </AlertMessage>
      ) : (
        <>
          <InformacionPeriodo periodo={periodo} />
          {periodo.Estado !== "CERRADO" ? (
            <AlertMessage type="warning" title="No se puede registrar el pago">
              {periodo.Estado === "PAGADO"
                ? "Este período ya fue pagado. Podés consultarlo en Planillas pagadas."
                : "Solo se puede registrar el pago de un período cerrado."}
            </AlertMessage>
          ) : (
            <>
              <AlertMessage
                type="warning"
                title="El registro incluye todos los restaurantes"
              >
                La confirmación guardará los detalles y conceptos del período
                completo. Revisá los importes de cada colaborador.
              </AlertMessage>

              <ResumenPlanilla
                resumenGeneralPlanilla={resumenGeneralPlanilla}
                tituloIngresos="Ingresos del período"
                tituloNeto="Neto por registrar"
              />

              <section aria-labelledby="registro-detalles-titulo">
                <div className="planilla-section-heading">
                  <h2 id="registro-detalles-titulo">
                    Revisión por colaborador
                  </h2>
                  <span>
                    {detalles.length} colaboradores · {cantidadRestaurantes}{" "}
                    restaurantes
                  </span>
                </div>
                <TablaDetallesPlanilla
                  detalles={detalles}
                  onVerConceptos={(detalle, nombre) => setDetalleSeleccionado({ detalle, nombre })}
                />
              </section>

              {detalles.length === 0 && (
                <AlertMessage type="info" title="Sin ingresos para registrar">
                  No hay colaboradores con ingresos en este período.
                </AlertMessage>
              )}
              {!llegoFechaPago && (
                <AlertMessage type="warning" title="Fecha de pago">
                  {fechaPago
                    ? "Todavía no ha llegado la fecha de pago del período."
                    : "El período no tiene una fecha de pago definida."}
                </AlertMessage>
              )}

              <footer className="planilla-pie">
                <p className="planilla-nota">
                  El servidor volverá a calcular los importes al registrar el
                  pago.
                </p>
                <div className="table-actions">
                  <Link to="/planillas" className="button button-secondary">
                    Volver
                  </Link>

                  <button
                    type="button"
                    className="button button-primary"
                    disabled={!puedeRegistrar}
                    onClick={() => setMostrarConfirmacion(true)}
                  >
                    <CheckCheck size={18} aria-hidden="true" /> Revisar
                    confirmación
                  </button>
                </div>
              </footer>

              {mostrarConfirmacion && puedeRegistrar && (
                <ConfirmarPagoModal
                  key={periodoId}
                  periodo={periodo}
                  resumen={resumenGeneralPlanilla}
                  cantidadColaboradores={detalles.length}
                  cantidadRestaurantes={cantidadRestaurantes}
                  onCerrar={() => setMostrarConfirmacion(false)}
                  onRegistrado={pagoRegistrado}
                />
              )}
              {detalleSeleccionado && detalles.includes(detalleSeleccionado.detalle) && (
                <DetallePreplanillaModal
                  detalle={detalleSeleccionado.detalle}
                  nombre={detalleSeleccionado.nombre}
                  onCerrar={() => setDetalleSeleccionado(null)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
