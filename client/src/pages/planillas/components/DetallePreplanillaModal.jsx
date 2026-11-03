import Dialog from "../../../components/dialog.jsx";
import ResumenPlanilla from "./ResumenPlanilla.jsx";
import TablaConceptosPlanilla from "./TablaConceptosPlanilla.jsx";

export default function DetallePreplanillaModal({ detalle, nombre, onCerrar }) {
  // La vista previa usa camelCase; la tabla comparte el formato de los conceptos guardados.
  const conceptos = (detalle.conceptos ?? []).map((concepto) => ({
    TipoConcepto: concepto.tipoConcepto,
    CodigoConcepto: concepto.codigoConcepto,
    TipoJornada: concepto.tipoJornada,
    Minutos: concepto.minutos,
    FactorAplicado: concepto.factorAplicado,
    Monto: concepto.monto,
  }));

  return (
    <Dialog titulo="Detalle de preplanilla" subtitulo={nombre} onCerrar={onCerrar}>
      <p className="planilla-nota">
        Importes estimados del período seleccionado. El pago todavía no está registrado.
      </p>
      <ResumenPlanilla resumenGeneralPlanilla={detalle} />
      <TablaConceptosPlanilla conceptos={conceptos} />
      <div className="solicitud-create-actions">
        <button type="button" className="button button-secondary" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Dialog>
  );
}
