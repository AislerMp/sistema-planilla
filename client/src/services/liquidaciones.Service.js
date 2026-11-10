import { crearQuery, ensureApiUrl, parseResponse } from "../utils/helper.js";

const endpoint = `${import.meta.env.VITE_API_URL}/liquidaciones`;

// Consultas disponibles para RH y Administración. Sin restaurante incluye todos.
export async function getLiquidaciones({
  restauranteId,
  desde,
  hasta,
  motivoSalida,
} = {}) {
  ensureApiUrl();

  const query = crearQuery({
    restauranteId: restauranteId === "todos" ? null : restauranteId,
    desde,
    hasta,
    motivoSalida,
  });
  const response = await fetch(`${endpoint}${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getLiquidacionById(liquidacionId) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(liquidacionId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// Devuelve la liquidación registrada de la persona seleccionada.
export async function getLiquidacionByColaborador(colaboradorId) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/colaboradores/${encodeURIComponent(colaboradorId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

async function enviarDatosSalida(
  colaboradorId,
  accion,
  { motivoSalida, fechaSalida, diasPreavisoTrabajados, observacion } = {},
) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/colaboradores/${encodeURIComponent(colaboradorId)}/${accion}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motivoSalida,
        fechaSalida,
        diasPreavisoTrabajados,
        observacion,
      }),
    },
  );

  return parseResponse(response);
}

// Vista previa sin guardar. fechaSalida debe tener formato YYYY-MM-DD.
export async function calcularLiquidacion(colaboradorId, datosSalida = {}) {
  return enviarDatosSalida(colaboradorId, "calculo", datosSalida);
}

// Solo RH. El backend recalcula los importes y obtiene el actor de la sesión.
// Devuelve { message, liquidacion }, tal como responde el controller.
export async function confirmarLiquidacion(colaboradorId, datosSalida = {}) {
  return enviarDatosSalida(colaboradorId, "confirmar", datosSalida);
}
