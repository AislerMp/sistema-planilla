import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ResumenPlanilla from "../components/ResumenPlanilla.jsx";
import TablaConceptosPlanilla from "../components/TablaConceptosPlanilla.jsx";
import { getConceptosPlanilla } from "../../../services/planillas.Service.js";
import useAsyncRequest from "../../../hooks/useAsyncRequest.js";
import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";

export default function DetallePagoPage() {
  const { detalleId } = useParams();

  const { data, isLoading, error } = useAsyncRequest(
    () => getConceptosPlanilla(detalleId),
    [detalleId],
  );
  const conceptos = data ?? [];

  const totalIngresos = Number(conceptos
    .filter((concepto) => concepto.TipoConcepto === "INGRESO")
    .reduce((sum, concepto) => sum + Number(concepto.Monto), 0).toFixed(2));

  const totalDeducciones = Number(conceptos
    .filter((concepto) => concepto.TipoConcepto === "DEDUCCION")
    .reduce((sum, concepto) => sum + Number(concepto.Monto), 0).toFixed(2));
    
  const resumenGeneralPlanilla = {
    totalIngresos,
    totalDeducciones,
    totalNeto: Number((totalIngresos - totalDeducciones).toFixed(2)),
  };

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
      </header>

      {isLoading ? (
        <LoadingState mensaje="Cargando detalle del pago..." compacto />
      ) : error ? (
        <AlertMessage title="No se pudo cargar el detalle del pago">
          {error}
        </AlertMessage>
      ) : (
        <>
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
    </div>
  );
}
