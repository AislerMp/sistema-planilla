import { Fragment } from "react";
import EtiquetaJornada from "./EtiquetaJornada.jsx";

const nombresConceptos = {
  ORDINARIAS: "Horas ordinarias",
  EXTRAS: "Horas extraordinarias",
  ORDINARIAS_FERIADO: "Horas ordinarias en feriado",
  EXTRAS_FERIADO: "Horas extraordinarias en feriado",
  VACACIONES: "Vacaciones reconocidas",
  INCAPACIDADES: "Reconocimiento de incapacidad",
};
const nombresJornadas = {
  DIURNA: "Diurna",
  MIXTA: "Mixta",
  NOCTURNA: "Nocturna",
};
const formatoNumero = new Intl.NumberFormat("es-CR", {
  maximumFractionDigits: 6,
});
const formatoMoneda = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
});

export default function TablaConceptosPlanilla({ conceptos = [] }) {
  return (
    <div className="data-panel planilla-conceptos-panel">
      <div
        className="table-scroll"
        role="region"
        aria-label="Conceptos del pago"
        tabIndex={0}
      >
        <table className="planilla-tabla planilla-conceptos">
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col">Jornada</th>
              <th scope="col" className="planilla-numero">
                Tiempo
              </th>
              <th scope="col" className="planilla-numero">
                Factor / %
              </th>
              <th scope="col" className="planilla-numero">
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {conceptos.length === 0 && (
              <tr>
                <td colSpan={5}>No hay conceptos para mostrar.</td>
              </tr>
            )}

            {["INGRESO", "DEDUCCION"].map((tipo) => {
              const grupo = conceptos.filter(
                (concepto) => concepto.TipoConcepto === tipo,
              );

              if (grupo.length === 0) return null;

              return (
                <Fragment key={tipo}>
                  <tr className="planilla-grupo-conceptos">
                    <th colSpan={5} scope="rowgroup">
                      {tipo === "INGRESO" ? "Ingresos" : "Deducciones"}
                    </th>
                  </tr>

                  {grupo.map((concepto, index) => (
                    <tr key={concepto.ConceptoPlanillaId ?? index}>
                      <td>
                        {nombresConceptos[concepto.CodigoConcepto] ??
                          concepto.CodigoConcepto}
                      </td>
                      <td>
                        {concepto.TipoJornada ? (
                          <EtiquetaJornada
                            tipo={concepto.TipoJornada.toLowerCase()}
                          >
                            {nombresJornadas[concepto.TipoJornada] ??
                              concepto.TipoJornada}
                          </EtiquetaJornada>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="planilla-numero">
                        {concepto.Minutos == null
                          ? "—"
                          : `${Math.floor(concepto.Minutos / 60)} h ${String(concepto.Minutos % 60).padStart(2, "0")} min`}
                      </td>
                      <td className="planilla-numero">
                        {concepto.FactorAplicado == null
                          ? "—"
                          : tipo === "DEDUCCION"
                            ? `${formatoNumero.format(concepto.FactorAplicado * 100)} %`
                            : `× ${formatoNumero.format(concepto.FactorAplicado)}`}
                      </td>
                      <td className="planilla-numero">
                        {formatoMoneda.format(concepto.Monto)}
                      </td>
                    </tr>
                  ))}
                  {tipo === "INGRESO" ? (
                    <tr className="planilla-total-conceptos planilla-total-conceptos--ingresos">
                      <th scope="row" colSpan={2}>
                        Horas totales
                      </th>
                      <td className="planilla-numero">
                        {Math.floor(
                          grupo.reduce(
                            (total, concepto) =>
                              total + (concepto.Minutos ?? 0),
                            0,
                          ) / 60,
                        )}
                        {" h "}
                        {String(
                          grupo.reduce(
                            (total, concepto) =>
                              total + (concepto.Minutos ?? 0),
                            0,
                          ) % 60,
                        ).padStart(2, "0")}{" "}
                        min
                      </td>
                      <td></td>
                      <td className="planilla-numero">
                        {formatoMoneda.format(
                          grupo.reduce(
                            (total, concepto) => total + (concepto.Monto ?? 0),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  ) : tipo === "DEDUCCION" ? (
                    <tr className="planilla-total-conceptos planilla-total-conceptos--deducciones">
                      <th scope="row" colSpan={3}>
                        Total deducciones
                      </th>
                      <td className="planilla-numero">
                        {formatoNumero.format(
                          grupo.reduce(
                            (total, concepto) =>
                              total + (concepto.FactorAplicado ?? 0),
                            0,
                          ) * 100,
                        )}{" "}
                        %
                      </td>
                      <td className="planilla-numero">
                        {formatoMoneda.format(
                          grupo.reduce(
                            (total, concepto) => total + (concepto.Monto ?? 0),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
