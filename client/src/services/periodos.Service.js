import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/periodos-planilla`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

export async function getPeriodos() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPeriodo(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPeriodoActual() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/actual`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// fechaAsignada debe tener el formato YYYY-MM-DD.
export async function getPeriodoPorFecha(fechaAsignada) {
  ensureApiUrl();

  const params = new URLSearchParams({ fechaAsignada });
  const response = await fetch(`${endpoint}/por-fecha?${params}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function createPeriodo({
  fechaInicio,
  fechaFin,
  fechaPago,
  fechaLimiteAjustes,
}) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fechaInicio, fechaFin, fechaPago, fechaLimiteAjustes }),
  });

  return parseResponse(response);
}

export async function updateEstadoPeriodo(id, { estado }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}/estado`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ estado }),
  });

  return parseResponse(response);
}

export default {
  getPeriodos,
  getPeriodo,
  getPeriodoActual,
  getPeriodoPorFecha,
  createPeriodo,
  updateEstadoPeriodo,
};
