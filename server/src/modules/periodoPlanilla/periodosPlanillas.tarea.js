import {
  actualizarEstadosPeriodos,
} from "./periodosPlanillas.service.js";

export async function iniciarTareaPeriodos(usuarioSistemaId) {
  let ejecutando = false;

  async function ejecutar() {
    if (ejecutando) return;

    ejecutando = true;

    try {
      await actualizarEstadosPeriodos(usuarioSistemaId);
    } finally {
      ejecutando = false;
    }
  }

  // Primera actualización antes de atender solicitudes.
  await ejecutar();

  const temporizador = setInterval(() => {
    ejecutar().catch((error) => {
      console.error(
        "No se pudieron actualizar los estados de períodos:",
        error,
      );
    });
  }, 60_000);

  return temporizador;
}