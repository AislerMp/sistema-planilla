import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ajustarMinutosAsistencia } from "../services/asistenciasDiarias.Service.js";
import { actualizarHorasExtra } from "../services/horasExtras.Service.js";
import AlertMessage from "./AlertMessage.jsx";

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
  const [form, setForm] = useState({
    horas: Math.floor(guardados.current.minutos / 60),
    minutos: guardados.current.minutos % 60,
    horasExtra: Math.floor(guardados.current.extras / 60),
    minutosExtra: guardados.current.extras % 60,
    motivo: "",
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

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

    setForm((anterior) => {
      const siguiente = { ...anterior, [name]: value };

      if (name === "motivo" || value === "") 
        return siguiente;

      if (name === "horas" || name === "minutos") {
        if (siguiente.horas === "" || siguiente.minutos === "") return siguiente;
        const horas = Number(siguiente.horas);
        const minutos = Number(siguiente.minutos);
        if (!Number.isInteger(horas) || horas < 0 ||
            !Number.isInteger(minutos) || minutos < 0 || minutos > 59) return siguiente;

        const total = horas * 60 + minutos;
        const calculadas = Math.max(0, total - 480);
        siguiente.horasExtra = Math.floor(calculadas / 60);
        siguiente.minutosExtra = calculadas % 60;
        if (total > 480) {
          siguiente.horas = 8;
          siguiente.minutos = 0;
        }
      }

      return siguiente;
    });
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (guardando) return;

    const minutos = Number(form.horas) * 60 + Number(form.minutos);
    const extras = Number(form.horasExtra) * 60 + Number(form.minutosExtra);

    if (
      [form.horas, form.minutos, form.horasExtra, form.minutosExtra].some(
        (valor) => valor === "" || !Number.isInteger(Number(valor)) || Number(valor) < 0,
      ) ||
      Number(form.minutos) > 59 || Number(form.minutosExtra) > 59 ||
      [minutos, extras, minutos + extras].some(
        (valor) => !Number.isInteger(valor) || valor < 0 || valor > 2147483647,
      )
    ) {
      setError("Revisá las horas y los minutos ingresados.");
      return;
    }

    if (minutos > 480 || (extras > 0 && minutos !== 480)) {
      setError("Las horas normales deben ser como máximo 8. Para registrar extras, deben ser 8 horas normales.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      // Una sola petición guarda ambos valores dentro de una transacción.
      if (minutos !== guardados.current.minutos) {
        await ajustarMinutosAsistencia(asistencia.AsistenciaId, {
          // Este servicio recibe el total y separa las normales de las extras.
          minutos: minutos + extras,
          motivo: form.motivo,
        });
        guardados.current.minutos = minutos;
      } else if (extras !== guardados.current.extras) {
        await actualizarHorasExtra(asistencia.AsistenciaId, {
          minutosAjustados: extras,
          motivo: form.motivo,
        });
        guardados.current.extras = extras;
      }
      onActualizada();
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const nombre = [asistencia.Nombres, asistencia.Apellidos]
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
        <fieldset disabled={guardando} aria-busy={guardando}>
          <section aria-labelledby="editar-horas-total">
            <h3 id="editar-horas-total">Horas normales</h3>
            <p className="muted">Al ingresar más de 8 horas, el excedente pasa a horas extra.</p>
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
          </section>
          <section aria-labelledby="editar-horas-extras">
            <h3 id="editar-horas-extras">Horas extra</h3>
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
