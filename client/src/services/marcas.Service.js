import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/marcas`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

// fechaAsignada usa el formato YYYY-MM-DD.
export async function getMisMarcas(fechaAsignada) {
  ensureApiUrl();
  const params = new URLSearchParams({ fechaAsignada });
  const response = await fetch(`${endpoint}/mis-marcas?${params}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

export async function getMarcasColaborador(id, fechaAsignada) {
  ensureApiUrl();
  const params = new URLSearchParams({ fechaAsignada });
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
