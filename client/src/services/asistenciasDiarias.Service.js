import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/AsistenciasDiarias`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

function crearQuery(filtros) {
  const params = new URLSearchParams();
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.set(campo, valor);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getAsistencia(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// Consulta las asistencias del colaborador autenticado.
// desde y hasta usan YYYY-MM-DD; se requiere al menos un filtro.
export async function getAsistenciasPorColaborador({ desde, hasta, periodoId } = {}) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, periodoId });
  const response = await fetch(`${endpoint}/colaborador${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// El gerente puede omitir restauranteId para consultar su restaurante asignado.
export async function getAsistenciasPorRestaurante({
  restauranteId,
  desde,
  hasta,
  periodoId,
} = {}) {
  ensureApiUrl();

  const query = crearQuery({ restauranteId, desde, hasta, periodoId });
  const response = await fetch(`${endpoint}/restaurante${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function ajustarMinutosAsistencia(id, { minutos, motivo }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}/minutos`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ minutos, motivo }),
  });

  return parseResponse(response);
}

export default {
  getAsistencia,
  getAsistenciasPorColaborador,
  getAsistenciasPorRestaurante,
  ajustarMinutosAsistencia,
};
