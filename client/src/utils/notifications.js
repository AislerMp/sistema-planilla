import Swal from "sweetalert2/dist/sweetalert2.js";
import "sweetalert2/dist/sweetalert2.min.css";
import { validarMotivoReversion } from "./reversionSolicitudes.js";

export async function confirmarReversion(estadoDestino, target) {
  const resultado = await Swal.fire({
    titleText: "Deshacer resolución",
    text: `La solicitud regresará a ${estadoDestino === "EN_REVISION_RH" ? "En revisión de Recursos Humanos" : "Pendiente"}. Se retirará la resolución anterior y quedará registrada la reversión.`,
    icon: "warning",
    input: "textarea",
    inputLabel: "Motivo obligatorio (máximo 500 caracteres)",
    inputAttributes: { maxlength: "500", rows: "3" },
    inputValidator: validarMotivoReversion,
    showCancelButton: true,
    confirmButtonText: "Deshacer resolución",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    focusCancel: true,
    keydownListenerCapture: true,
    background: "var(--color-surface)",
    color: "var(--color-text)",
    confirmButtonColor: "var(--color-primary)",
    // Dentro del dialog nativo para mantener la confirmación visible y accesible.
    ...(target ? { target } : {}),
  });
  return resultado.isConfirmed ? resultado.value.trim() : null;
}

// Se llama después de guardar: permanece visible aunque cambie la página.
export function notifySuccess(message, target) {
  return Swal.fire({
    toast: true,
    position: "top-end",
    icon: "success",
    titleText: message,
    showConfirmButton: false,
    showCloseButton: true,
    closeButtonAriaLabel: "Cerrar notificación",
    timer: 1500,
    timerProgressBar: true,
    background: "var(--color-surface)",
    color: "var(--color-text)",
    iconColor: "var(--color-success)",
    customClass: { popup: "app-notification" },
    ...(target ? { target } : {}),
    didOpen(popup) {
      // Permite leer el mensaje con calma usando el mouse o el teclado.
      popup.addEventListener("mouseenter", () => Swal.stopTimer());
      popup.addEventListener("mouseleave", () => {
        if (!popup.contains(document.activeElement)) Swal.resumeTimer();
      });
      popup.addEventListener("focusin", () => Swal.stopTimer());
      popup.addEventListener("focusout", (event) => {
        if (!popup.contains(event.relatedTarget) && !popup.matches(":hover")) {
          Swal.resumeTimer();
        }
      });
    },
  });
}
