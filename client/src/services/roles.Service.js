import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

const endpoint = `${API_URL}/roles`;

export async function getRoles() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getRol(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  getRoles,
  getRol,
};
