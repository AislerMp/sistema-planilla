import Swal from "sweetalert2/dist/sweetalert2.js";
import "sweetalert2/dist/sweetalert2.min.css";

// Se llama después de guardar: permanece visible aunque cambie la página.
export function notifySuccess(message) {
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
