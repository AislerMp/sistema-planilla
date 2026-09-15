import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

const endpoint = `${API_URL}/restaurantes`;

export async function getRestaurantes(estado = 'activos') {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/?estado=${encodeURIComponent(estado)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getRestaurante(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function createRestaurante({ nombre, distritoId, detalleDireccion }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ nombre, distritoId, detalleDireccion }),
  });

  return parseResponse(response);
}

export async function updateRestaurante(id, { nombre, distritoId, detalleDireccion }) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ nombre, distritoId, detalleDireccion }),
  });

  return parseResponse(response);
}

export async function activateRestaurante(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/activate/${id}`, {
    method: "POST",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function deactivateRestaurante(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  getRestaurantes,
  getRestaurante,
  createRestaurante,
  updateRestaurante,
  activateRestaurante,
  deactivateRestaurante,
};
