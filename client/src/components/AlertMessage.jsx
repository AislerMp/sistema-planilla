import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

const variants = {
  error: { icon: CircleAlert, title: "No se pudo completar la acción" },
  success: { icon: CircleCheck, title: "Operación completada" },
  warning: { icon: TriangleAlert, title: "Revisá esta información" },
  info: { icon: Info, title: "Información" },
};

// Mensaje que permanece visible dentro de la página o el formulario.
export default function AlertMessage({ type = "error", title, children, onClose }) {
  const variant = variants[type] ?? variants.error;
  const Icon = variant.icon;

  if (!children) return null;

  return (
    <div
      className={`alert-message alert-message--${variants[type] ? type : "error"}`}
      role={variant === variants.error ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon className="alert-message-icon" size={21} aria-hidden="true" />
      <div className="alert-message-copy">
        <p className="alert-message-title">{title || variant.title}</p>
        <p className="alert-message-text">{children}</p>
      </div>
      {onClose && (
        <button
          type="button"
          className="alert-message-close"
          aria-label="Cerrar mensaje"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}


