import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ajustarMinutosAsistencia } from "../services/asistenciasDiarias.Service.js";
import { actualizarHorasExtra } from "../services/horasExtras.Service.js";
import AlertMessage from "./AlertMessage.jsx";
import {
  distribuirMinutos,
  mostrarDuracion,
  puedeAjustarAsistencia,
} from "../utils/asistenciaUtils.js";
import { obtenerFechaHoyCostaRica } from "../utils/fechaUtils.js";

export default function EditarHorasModal({
  asistencia,
  onCerrar,
  onActualizada,
}) {
  const dialogRef = useRef(null);
  const guardados = useRef({
    minutos: asistencia.MinutosEfectivos ?? 0,
    extras: asistencia.MinutosExtras ?? 0,
  });
  const totalGuardado = guardados.current.minutos + guardados.current.extras;
  const [tipoAjuste, setTipoAjuste] = useState("total");

  const [form, setForm] = useState({
    horas: Math.floor(totalGuardado / 60),
    minutos: totalGuardado % 60,
    horasExtra: Math.floor(guardados.current.extras / 60),
    minutosExtra: guardados.current.extras % 60,
    motivo: "",
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const limiteOrdinario = asistencia.LimiteOrdinarioMinutos;
  const limiteValido = Number.isInteger(limiteOrdinario) && limiteOrdinario > 0;
  const puedeEditar = puedeAjustarAsistencia(
    asistencia,
    obtenerFechaHoyCostaRica(),
  );
  const totalIngresado =
    form.horas === "" ||
    form.minutos === "" ||
    !Number.isInteger(Number(form.horas)) ||
    Number(form.horas) < 0 ||
    !Number.isInteger(Number(form.minutos)) ||
    Number(form.minutos) < 0 ||
    Number(form.minutos) > 59
      ? null
      : Number(form.horas) * 60 + Number(form.minutos);
  const vistaPrevia = distribuirMinutos(totalIngresado, limiteOrdinario);

  useEffect(() => {
    const dialog = dialogRef.current;
    const overflowAnterior = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflowAnterior;
    };
  }, []);

  function cambiarCampo(event) {
    const { name, value } = event.target;
    setForm((anterior) => ({ ...anterior, [name]: value }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (guardando) return;
    if (!puedeEditar) {
      setError(
        "El período o su plazo de ajustes no permite editar esta asistencia.",
      );
      return;
    }

    const minutos = Number(form.horas) * 60 + Number(form.minutos);
    const extras = Number(form.horasExtra) * 60 + Number(form.minutosExtra);

    if (
      (tipoAjuste === "total"
        ? [form.horas, form.minutos]
        : [form.horasExtra, form.minutosExtra]
      ).some(
        (valor) =>
          valor === "" || !Number.isInteger(Number(valor)) || Number(valor) < 0,
      ) ||
      Number(tipoAjuste === "total" ? form.minutos : form.minutosExtra) > 59 ||
      [tipoAjuste === "total" ? minutos : extras].some(
        (valor) => !Number.isInteger(valor) || valor < 0 || valor > 2147483647,
      )
    ) {
      setError("Revisá las horas y los minutos ingresados.");
      return;
    }

    if (tipoAjuste === "total" && !limiteValido) {
      setError(
        "No se recibió un límite ordinario válido. Recargá las asistencias antes de distribuir las horas.",
      );
      return;
    }

    setGuardando(true);
    setError("");
    try {
      // Una sola petición guarda ambos valores dentro de una transacción.
      if (tipoAjuste === "total" && minutos !== totalGuardado) {
        await ajustarMinutosAsistencia(asistencia.AsistenciaId, {
          // Este servicio recibe el total y separa las normales de las extras.
          minutos,
          motivo: form.motivo,
        });
      } else if (
        tipoAjuste === "extras" &&
        extras !== guardados.current.extras
      ) {
        await actualizarHorasExtra(asistencia.AsistenciaId, {
          minutosAjustados: extras,
          motivo: form.motivo,
        });
      }
      // La tabla vuelve a consultar los valores efectivos guardados por el servidor.
      await onActualizada();
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const nombre = [asistencia.Nombres, asistencia.Apellido1, asistencia.Apellido2]
    .filter(Boolean)
    .join(" ");
  const fecha = asistencia.FechaAsignada.slice(0, 10);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="data-panel editar-horas-modal"
      aria-labelledby="editar-horas-titulo"
      aria-describedby="editar-horas-fecha"
      onCancel={(event) => {
        event.preventDefault();
        if (!guardando) onCerrar();
      }}
    >
      <header className="editar-horas-encabezado">
        <div>
          <p className="muted">{nombre || "Colaborador"}</p>
          <h2 id="editar-horas-titulo">Detalle del día</h2>
          <p id="editar-horas-fecha" className="muted">
            <time dateTime={fecha}>
              {new Date(fecha + "T00:00:00Z").toLocaleDateString("es-CR", {
                dateStyle: "full",
                timeZone: "UTC",
              })}
            </time>
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          aria-label="Cerrar detalle"
          onClick={onCerrar}
          disabled={guardando}
        >
          ×
        </button>
      </header>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={guardando || !puedeEditar} aria-busy={guardando}>
          <label htmlFor="tipo-ajuste">
            Modificar
            <select
              id="tipo-ajuste"
              value={tipoAjuste}
              onChange={(event) => {
                setTipoAjuste(event.target.value);
                setError("");
              }}
            >
              <option value="total">Total de horas del día</option>
              <option value="extras">Solo horas extra</option>
            </select>
          </label>
          <p className="muted">
            Jornada: {asistencia.TipoJornada ?? "Sin clasificar"} ·{" "}
            {limiteValido
              ? `Límite ordinario: ${mostrarDuracion(limiteOrdinario)}`
              : "Límite ordinario no disponible"}
          </p>
          
          {tipoAjuste === "total" ? (
            <section aria-labelledby="editar-horas-total">
              <h3 id="editar-horas-total">Horas totales del día</h3>
              <p className="muted">
                Incluí ordinarias y extras una sola vez. El servidor confirma la
                distribución al guardar.
              </p>
              <div className="editar-horas-campos">
                <label htmlFor="total-horas">
                  Horas
                  <input
                    id="total-horas"
                    name="horas"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.horas}
                    onChange={cambiarCampo}
                  />
                </label>
                <label htmlFor="total-minutos">
                  Minutos
                  <input
                    id="total-minutos"
                    name="minutos"
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    required
                    value={form.minutos}
                    onChange={cambiarCampo}
                  />
                </label>
              </div>
              <p
                className="editar-horas-vista-previa"
                role="status"
                aria-live="polite"
              >
                {!limiteValido
                  ? "No se recibió un límite ordinario válido. Recargá las asistencias antes de distribuir las horas."
                  : vistaPrevia
                    ? `Vista previa: ${mostrarDuracion(vistaPrevia.minutosOrdinarios)} ordinarias y ${mostrarDuracion(vistaPrevia.minutosExtras)} extras.`
                    : "Ingresá horas y minutos válidos para ver la distribución."}
              </p>
            </section>
          ) : (
            <section aria-labelledby="editar-horas-extras">
              <h3 id="editar-horas-extras">Horas extra</h3>
              <p className="muted">
                Este ajuste modifica las extras de forma independiente, según
                las reglas del servidor.
              </p>
              <div className="editar-horas-campos">
                <label htmlFor="extras-horas">
                  Horas
                  <input
                    id="extras-horas"
                    name="horasExtra"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.horasExtra}
                    onChange={cambiarCampo}
                  />
                </label>
                <label htmlFor="extras-minutos">
                  Minutos
                  <input
                    id="extras-minutos"
                    name="minutosExtra"
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    required
                    value={form.minutosExtra}
                    onChange={cambiarCampo}
                  />
                </label>
              </div>
            </section>
          )}
          <label htmlFor="ajuste-motivo">
            Motivo del ajuste (opcional)
            <textarea
              id="ajuste-motivo"
              name="motivo"
              rows={2}
              maxLength={500}
              placeholder="Describí el motivo del cambio"
              value={form.motivo}
              onChange={cambiarCampo}
            />
          </label>
          {error && <AlertMessage>{error}</AlertMessage>}
          <footer className="table-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onCerrar}
            >
              Cerrar
            </button>
            <button type="submit" className="button button-primary">
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </footer>
        </fieldset>
      </form>
    </dialog>,
    document.body,
  );
}
