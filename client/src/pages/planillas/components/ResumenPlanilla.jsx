import AlertMessage from "../../../components/AlertMessage.jsx";
import LoadingState from "../../../components/loadingState.jsx";

export default function ResumenPlanilla({
  resumenGeneralPlanilla,
  isLoading,
  error,
  tituloIngresos = "Ingresos estimados",
  tituloNeto = "Neto estimado",
}) {

  function formatCurrency(value) {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
    }).format(value);
  }

  if (isLoading) {
    return <LoadingState mensaje="Cargando resumen de planilla..." compacto />;
  }

  if (error) {
    return (
      <AlertMessage title="No se pudo cargar el resumen de planilla">
        {error}
      </AlertMessage>
    );
  }

  if (!resumenGeneralPlanilla) return null;
  
  return (
    <section className="planilla-resumen" aria-label="Resumen de importes">
      <article className="data-panel planilla-importe">
        <h2>{tituloIngresos}</h2>
        <p>Remuneración de la consulta</p>
        <strong>{formatCurrency(resumenGeneralPlanilla?.totalIngresos)}</strong>
      </article>
      <article className="data-panel planilla-importe">
        <h2>Deducciones</h2>
        <p>Detalle disponible por concepto</p>
        <strong>{formatCurrency(resumenGeneralPlanilla?.totalDeducciones)}</strong>
      </article>
      <article className="data-panel planilla-importe planilla-importe--neto">
        <h2>{tituloNeto}</h2>
        <p>Ingresos menos deducciones</p>
        <strong>{formatCurrency(resumenGeneralPlanilla?.totalNeto)}</strong>
      </article>
    </section>
  );
}
