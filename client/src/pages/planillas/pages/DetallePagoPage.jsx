import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { createPortal } from "react-dom";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaConceptosPlanilla from "../components/TablaConceptosPlanilla.jsx";
import { getConceptosPlanilla } from "../../../services/planillas.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";
import { formatDate } from "../../../utils/fechaUtils.js";

export default function DetallePagoPage() {
  const { detalleId } = useParams();

  const { data, isLoading, error } = useAsyncRequest(
    () => getConceptosPlanilla(detalleId),
    [detalleId],
  );
  const conceptos = data ?? [];
  const detalle = conceptos[0];
  const resumenGeneralPlanilla = detalle ? {
    totalIngresos: detalle.TotalIngresos,
    totalDeducciones: detalle.TotalDeducciones,
    totalNeto: detalle.TotalNeto,
  } : null;
  const puedeImprimir = !isLoading && !error && detalle?.EstadoPeriodo === "PAGADO";

  return (
    <div className="planillas-page">
      <Link className="planilla-volver" to="/planillas/pagadas">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a planillas pagadas
      </Link>

      <header className="page-header">
        <div>
          <p className="eyebrow accent">DESGLOSE INDIVIDUAL</p>
          <h1>Detalle del pago</h1>
          <p>Ingresos, deducciones y jornadas reconocidas en el período.</p>
        </div>
        <span className="subtle-tag">Detalle #{detalleId}</span>
        {puedeImprimir && (
          <button type="button" className="button button-secondary" onClick={() => window.print()}>
            <Printer size={17} aria-hidden="true" />
            Imprimir / Guardar como PDF
          </button>
        )}
      </header>

      {isLoading ? (
        <LoadingState mensaje="Cargando detalle del pago..." compacto />
      ) : error ? (
        <AlertMessage title="No se pudo cargar el detalle del pago">
          {error}
        </AlertMessage>
      ) : (
        <>
          {detalle && (
            <section className="data-panel planilla-colaborador" aria-label="Colaborador del pago">
              <div>
                <h2>{[detalle.ColaboradorNombre, detalle.ColaboradorApellido1, detalle.ColaboradorApellido2].filter(Boolean).join(" ")}</h2>
                <p>{detalle.RestauranteNombre}</p>
              </div>
              <p className="planilla-nota">{formatDate(detalle.FechaInicio)} – {formatDate(detalle.FechaFin)}</p>
            </section>
          )}
          {conceptos.length > 0 && (
            <ResumenPlanilla
              resumenGeneralPlanilla={resumenGeneralPlanilla}
              tituloIngresos="Ingresos pagados"
              tituloNeto="Neto pagado"
            />
          )}

          <section aria-labelledby="pago-conceptos-titulo">
            <div className="planilla-section-heading">
              <h2 id="pago-conceptos-titulo">Conceptos del pago</h2>
              <span>Tiempo real · Montos en colones</span>
            </div>
            <TablaConceptosPlanilla conceptos={conceptos} />
          </section>
          <p className="planilla-nota planilla-pie">
            Importes guardados al registrar el pago.
          </p>
        </>
      )}
      {puedeImprimir && createPortal(
        <section className="planilla-impresion" aria-label="Comprobante individual de planilla pagada">
          <header className="planilla-impresion-encabezado">
            <div>
              <p className="planilla-impresion-marca">Gestión de planilla</p>
              <h1>Comprobante de pago</h1>
              <p>Detalle de ingresos y deducciones</p>
            </div>
            <div className="planilla-impresion-referencia">
              <span>Período pagado</span>
              <strong>P-{String(detalle.PeriodoId).padStart(4, "0")}</strong>
              <small>Comprobante #{detalle.DetallePlanillaId}</small>
            </div>
          </header>
          <dl className="planilla-impresion-datos">
            <div className="planilla-impresion-persona">
              <dt>Colaborador</dt>
              <dd>{[detalle.ColaboradorNombre, detalle.ColaboradorApellido1, detalle.ColaboradorApellido2].filter(Boolean).join(" ")}</dd>
            </div>
            <div><dt>Restaurante</dt><dd>{detalle.RestauranteNombre}</dd></div>
            <div>
              <dt>Período</dt>
              <dd>{formatDate(detalle.FechaInicio)} – {formatDate(detalle.FechaFin)}</dd>
            </div>
            {detalle.FechaPago && (
              <div><dt>Fecha de pago registrada</dt><dd>{formatDate(detalle.FechaPago)}</dd></div>
            )}
          </dl>
          <h2 className="planilla-impresion-titulo">Conceptos del pago</h2>
          <TablaConceptosPlanilla conceptos={conceptos} />
          <div className="planilla-impresion-totales">
            <h2 className="planilla-impresion-titulo">Resumen del comprobante</h2>
            <ResumenPlanilla
              resumenGeneralPlanilla={resumenGeneralPlanilla}
              tituloIngresos="Salario bruto"
              tituloNeto="Neto pagado"
            />
          </div>
          <footer className="planilla-impresion-pie">
            <span>Importes guardados al registrar la planilla · Montos en colones (CRC).</span>
          </footer>
        </section>,
        document.body,
      )}
    </div>
  );
}
