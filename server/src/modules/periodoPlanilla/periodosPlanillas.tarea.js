import {
  actualizarEstadosPeriodos,
} from "./periodosPlanillas.service.js";

let inicioTarea = null;

export function iniciarTareaPeriodos(usuarioSistemaId) {
  // Compartir también la primera ejecución si se intenta iniciar dos veces.
  if (!inicioTarea) {
    inicioTarea = crearTemporizador(usuarioSistemaId).catch((error) => {
      inicioTarea = null;
      throw error;
    });
  }
  return inicioTarea;
}

async function crearTemporizador(usuarioSistemaId) {
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
