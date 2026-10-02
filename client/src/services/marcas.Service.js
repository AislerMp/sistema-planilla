import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/marcas`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

// Limites opcionales e inclusivos (YYYY-MM-DD); sin filtros devuelve todo el historial.
export async function getMisMarcas({ desde, hasta } = {}) {
  ensureApiUrl();
  
  const params = new URLSearchParams();
  for (const [campo, valor] of Object.entries({ desde, hasta })) {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.set(campo, valor);
    }
  }
  const query = params.toString();
  const response = await fetch(`${endpoint}/mis-marcas${query ? `?${query}` : ""}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

export async function getMarcasColaborador(id, { desde, hasta } = {}) {
  ensureApiUrl();
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const response = await fetch(`${endpoint}/colaborador/${id}?${params}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

// El backend obtiene el colaborador de la sesion y calcula la hora de la marca.
export async function registrarEntrada() {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/entrada`, {
    method: "POST",
    credentials: "include",
  });
  return parseResponse(response);
}

export async function registrarSalida() {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/salida`, {
    method: "POST",
    credentials: "include",
  });
  return parseResponse(response);
}

export default {
  getMisMarcas,
  getMarcasColaborador,
  registrarEntrada,
  registrarSalida,
};
