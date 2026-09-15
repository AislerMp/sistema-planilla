import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

const endpoint = `${API_URL}/puestos`;

export async function getPuestos(estado = 'activos') {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/?estado=${encodeURIComponent(estado)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPuesto(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function createPuesto({ nombre, tarifaHora }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ nombre, tarifaHora }),
  });

  return parseResponse(response);
}

export async function updateTarifaPuesto(id, { tarifaHora }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}/tarifa`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ tarifaHora }),
  });

  return parseResponse(response);
}

export async function activatePuesto(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/activate/${id}`, {
    method: "POST",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function deactivatePuesto(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  getPuestos,
  getPuesto,
  createPuesto,
  updateTarifaPuesto,
  activatePuesto,
  deactivatePuesto,
};
