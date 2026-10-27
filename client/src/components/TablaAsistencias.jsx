import { useState } from "react";
import { obtenerDiasDelRango, obtenerFechaHoyCostaRica } from "../utils/fechaUtils.js";
import { mostrarDuracion, puedeAjustarAsistencia, obtenerRangoAsistencias } from "../utils/asistenciaUtils.js";
import Dialog from "./dialog.jsx";
import AlertMessage from "./AlertMessage.jsx";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const jornadas = {
  DIURNA: { nombre: "Diurna", color: "diurna", descripcion: "Trabajo dentro del rango diurno de referencia." },
  MIXTA: { nombre: "Mixta", color: "mixta", descripcion: "Combina tiempo diurno y nocturno." },
  NOCTURNA: { nombre: "Nocturna", color: "nocturna", descripcion: "Jornada clasificada como nocturna según la regla del sistema." },
};

const sinClasificar = {
  nombre: "Sin clasificar", color: "sin-clasificar",
  descripcion: "La asistencia todavía no tiene una jornada clasificada. El límite de compatibilidad lo proporciona el servidor.",
};

function agruparAsistencias(asistencias, listadoColaboradores, desde, hasta) {
  const colaboradores = {};

  for (const colaborador of listadoColaboradores) {
    const ingreso = colaborador.FechaIngreso?.slice(0, 10);
    const salida = colaborador.FechaSalida?.slice(0, 10);
    if ((ingreso && ingreso > hasta) || (salida && salida < desde)) continue;

    if (colaborador.PuestoId === 1 || colaborador.PuestoId === 3) {
      colaboradores[colaborador.ColaboradorId] = {
        colaboradorId: colaborador.ColaboradorId,
        nombres: colaborador.Nombres,
        apellidos: colaborador.Apellidos,
        identificacion: colaborador.Identificacion,
        dias: {},
      };
    }
  }

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
  colaboradores: listadoColaboradores = [],
  desde,
  hasta,
  nombreColaborador = "Mis asistencias",
  onSeleccionarAsistencia,
  puedeVerMarcas = false,
}) {

  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null);
  const fechaHoy = obtenerFechaHoyCostaRica();
  const detalleJornada = jornadas[jornadaSeleccionada?.TipoJornada] ?? sinClasificar;
  const limiteDetalle = jornadaSeleccionada?.LimiteOrdinarioMinutos;

  const fechas = asistencias.map((asistencia) => asistencia.FechaAsignada.slice(0, 10)).sort();
  const semana = obtenerRangoAsistencias();
  const inicio = desde || fechas[0] || semana.desde;
  const fin = hasta || fechas.at(-1) || semana.hasta;
  const dias = obtenerDiasDelRango(inicio, fin);
  const colaboradores = agruparAsistencias(asistencias, listadoColaboradores, inicio, fin);
  if (colaboradores.length === 0) {
    return <AlertMessage type="info" title="Sin colaboradores">No hay colaboradores con vínculo laboral en este rango ni asistencias registradas.</AlertMessage>;
  }

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

                  const jornada = jornadas[asistencia.TipoJornada] ?? sinClasificar;
                  const puedeEditar = puedeAjustarAsistencia(asistencia, fechaHoy);

                  return (
                    <td key={fecha}>
                      {onSeleccionarAsistencia ? (
                        <button
                          type="button"
                          disabled={!puedeEditar}
                          title={!puedeEditar ? "El período o su plazo de ajustes no permite editar." : undefined}
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
                      <div>
                        <button
                          type="button"
                          className={`jornada-etiqueta jornada-etiqueta--${jornada.color}`}
                          aria-haspopup="dialog"
                          aria-expanded={jornadaSeleccionada?.AsistenciaId === asistencia.AsistenciaId}
                          aria-label={`Jornada ${jornada.nombre}, ${nombre}, ${mostrarFecha(fecha)}. Ver detalle`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setJornadaSeleccionada(asistencia);
                          }}
                        >
                          {jornada.nombre}
                        </button>
                      </div>
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
      {jornadaSeleccionada && (
        <Dialog
          titulo={`Jornada ${detalleJornada.nombre.toLowerCase()}`}
          subtitulo={mostrarFecha(jornadaSeleccionada.FechaAsignada.slice(0, 10))}
          onCerrar={() => setJornadaSeleccionada(null)}
        >
          <div className="detalle-jornada">
            <p><strong>Límite ordinario aplicado</strong><br />
              {Number.isInteger(limiteDetalle) && limiteDetalle > 0
                ? mostrarDuracion(limiteDetalle)
                : "No se recibió un límite ordinario válido."}
            </p>
            <p>{detalleJornada.descripcion}</p>
            <div className="table-actions">
              <button type="button" className="button button-secondary" onClick={() => setJornadaSeleccionada(null)}>Cerrar</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
