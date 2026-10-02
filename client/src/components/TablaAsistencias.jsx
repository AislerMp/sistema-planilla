import { obtenerDiasDelRango } from "../utils/fechaUtils.js";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

function agruparAsistencias(asistencias) {
  const colaboradores = {};

  for (const asistencia of asistencias) {
    const colaboradorId = asistencia.ColaboradorId;
    const fecha = asistencia.FechaAsignada.slice(0, 10);

    if (!colaboradores[colaboradorId]) {
      colaboradores[colaboradorId] = {
        colaboradorId,
        nombres: asistencia.Nombres,
        apellidos: asistencia.Apellidos,
        identificacion: asistencia.Identificacion,
        dias: {},
      };
    }

    colaboradores[colaboradorId].dias[fecha] = asistencia;
  }

  return Object.values(colaboradores);
}

function mostrarHoras(minutos) {
  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;

  return `${horas}:${String(restantes).padStart(2, "0")}`;
}


function mostrarFecha(fecha) {
  return new Date(`${fecha}T00:00:00Z`).toLocaleDateString("es-CR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function TablaAsistencias({
  asistencias = [],
  desde,
  hasta,
  nombreColaborador = "Mis asistencias",
  onSeleccionarAsistencia,
  puedeVerMarcas = false,
}) {
  if (asistencias.length === 0) return null;

  const fechas = asistencias.map((asistencia) => asistencia.FechaAsignada.slice(0, 10)).sort();
  const dias = obtenerDiasDelRango(desde || fechas[0], hasta || fechas.at(-1));
  const colaboradores = agruparAsistencias(asistencias);

  return (
    <section className="data-panel asistencias-resultados" aria-label="Resultados de asistencias">
      <div className="table-toolbar">
        <div>
          <h2>Resumen de asistencias</h2>
          <p className="muted">Horas trabajadas y extras · horas:minutos</p>
        </div>
        <p className="muted" role="status">
          <strong>{colaboradores.length}</strong>{" "}
          {colaboradores.length === 1 ? "colaborador" : "colaboradores"}
          {" · "}{asistencias.length} registros
        </p>
      </div>
      <div className="tabla-asistencias-contenedor" tabIndex={0} role="region" aria-label="Asistencias por día. Desplázate para ver más fechas y colaboradores.">
      <table className="tabla-asistencias">
        <thead>
          <tr>
            <th scope="col">Colaborador</th>

            {dias.map((fecha) => (
              <th scope="col" key={fecha}>
                {mostrarFecha(fecha)}
              </th>
            ))}

            <th scope="col">Total del rango</th>
          </tr>
        </thead>

        <tbody>
          {colaboradores.map((colaborador) => {
            let totalNormales = 0;
            let totalExtras = 0;

            for (const fecha of dias) {
              const asistencia = colaborador.dias[fecha];

              totalNormales += asistencia?.MinutosEfectivos ?? 0;
              totalExtras += asistencia?.MinutosExtras ?? 0;
            }

            const nombre = [
              colaborador.nombres,
              colaborador.apellidos,
            ]
              .filter(Boolean)
              .join(" ") || nombreColaborador;

            return (
              <tr key={colaborador.colaboradorId}>
                <th scope="row">
                  {puedeVerMarcas ? (
                    <Link
                      className="colaborador-marcas-link"
                      to={`/asistencia/colaborador/${colaborador.colaboradorId}/marcas`}
                      state={{ nombre }}
                      aria-label={`Consultar marcas de ${nombre}`}
                    >
                      {nombre} <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  ) : nombre}
                  <small>{colaborador.identificacion}</small>
                </th>
                {dias.map((fecha) => {
                  const asistencia = colaborador.dias[fecha];

                  if (!asistencia) {
                    return <td key={fecha}><span className="muted" aria-label="Sin registro">—</span></td>;
                  }

                  const contenido = (
                    <>
                      <span>
                       {mostrarHoras(asistencia.MinutosEfectivos ?? 0)}
                      </span>

                      <small>
                        Extras: {mostrarHoras(asistencia.MinutosExtras ?? 0)}
                      </small>
                    </>
                  );

                  return (
                    <td key={fecha}>
                      {onSeleccionarAsistencia ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSeleccionarAsistencia(asistencia)
                          }
                          aria-label={`Ver asistencia de ${nombre}, ${mostrarFecha(fecha)}`}
                        >
                          {contenido}
                        </button>
                      ) : (
                        contenido
                      )}
                    </td>
                  );
                })}

                <td>
                  <strong>Total: {mostrarHoras(totalNormales)}</strong>
                  <small>Extras: {mostrarHoras(totalExtras)}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}
