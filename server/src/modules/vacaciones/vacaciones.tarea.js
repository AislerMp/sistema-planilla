import {
  actualizarAcumulacionVacaciones,
} from "./services/saldosVacaciones.service.js";
import { obtenerFechaCorteVacaciones } from "../../shared/utils/fechaUtils.js";

let inicioTarea = null;

export function iniciarTareaVacaciones(usuarioSistemaId) {
  // Compartir también la primera ejecución si se intenta iniciar dos veces.
  if (!inicioTarea) {
    inicioTarea = crearTemporizador(usuarioSistemaId).catch((error) => {
      inicioTarea = null;
      throw error;
    });
  }
  return inicioTarea;
}

export async function detenerTareaVacaciones() {
  const inicio = inicioTarea;
  if (!inicio) return;
  try {
    clearInterval(await inicio);
  } finally {
    if (inicioTarea === inicio) inicioTarea = null;
  }
}

async function crearTemporizador(usuarioSistemaId) {
  let ejecutando = false;
  let ultimoCorteCompletado = null;

  async function ejecutar() {
    if (ejecutando) return;

    ejecutando = true;

    try {
      const fechaCorte = obtenerFechaCorteVacaciones();
      if (fechaCorte === ultimoCorteCompletado) return;

      // Pasar el mismo corte evita recalcularlo si la consulta cruza las 5 a. m.
      const resumen = await actualizarAcumulacionVacaciones(usuarioSistemaId, fechaCorte);
      console.log(resumen);
      if (resumen.fallidos === 0) ultimoCorteCompletado = fechaCorte;
    } finally {
      ejecutando = false;
    }
  }

  // Primera actualización antes de atender solicitudes.
  await ejecutar();

  const temporizador = setInterval(() => {
    ejecutar().catch((error) => {
      console.error(
        "No se pudo actualizar la acumulación de vacaciones:",
        error,
      );
    });
  }, 60_000);

  return temporizador;
}
