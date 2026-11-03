import { crearQuery, ensureApiUrl, parseResponse } from "../utils/helper.js";

const endpoint = `${import.meta.env.VITE_API_URL}/aguinaldos`;

// Historial general de aguinaldos, disponible para RH y Administración.
export async function getAguinaldos() {
  ensureApiUrl();

  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getAguinaldoById(aguinaldoId) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(aguinaldoId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// Detalles confirmados. El servidor limita el alcance según el usuario de sesión.
export async function getDetallesAguinaldo({
  aguinaldoId,
  anio,
  colaboradorId,
  restauranteId,
} = {}) {
  ensureApiUrl();

  const query = crearQuery({ aguinaldoId, anio, colaboradorId, restauranteId });
  const response = await fetch(`${endpoint}/detalles${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// Vista previa por año: no registra el aguinaldo.
export async function calcularAguinaldo(
  anio,
  { colaboradorId, restauranteId } = {},
) {
  ensureApiUrl();

  const query = crearQuery({ colaboradorId, restauranteId });
  const response = await fetch(
    `${endpoint}/anios/${encodeURIComponent(anio)}/calculo${query}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// Solo RH. El backend recalcula el año completo y obtiene el actor de la sesión.
// Devuelve { message, resultado }, tal como responde el controlador.
export async function confirmarAguinaldo(anio) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/anios/${encodeURIComponent(anio)}/confirmar`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  return parseResponse(response);
}
