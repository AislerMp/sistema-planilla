import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function Dialog({
  titulo,
  subtitulo,
  onCerrar,
  ocupado = false,
  children,
}) {
  const dialogRef = useRef(null);
  const tituloId = useId();

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

  return (
    <dialog
      ref={dialogRef}
      className="data-panel solicitudes-modal"
      aria-labelledby={tituloId}
      onCancel={(event) => {
        event.preventDefault();
        if (!ocupado) onCerrar();
      }}
    >
      <header className="solicitudes-modal-header">
        <div>
          {subtitulo && <p className="solicitudes-modal-subtitle">{subtitulo}</p>}
          <h2 id={tituloId}>{titulo}</h2>
        </div>
        <button
          type="button"
          className="solicitudes-modal-close"
          aria-label="Cerrar"
          disabled={ocupado}
          onClick={onCerrar}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="solicitudes-modal-content">{children}</div>
    </dialog>
  );
}
