import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

const endpoint = `${API_URL}/ubicaciones`;

export async function getProvincias() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/provincias`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getProvincia(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/provincias/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getCantones(provinciaId) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/provincias/${provinciaId}/cantones`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getCanton(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/cantones/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getDistritos(cantonId) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/cantones/${cantonId}/distritos`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getDistrito(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/distritos/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  getProvincias,
  getProvincia,
  getCantones,
  getCanton,
  getDistritos,
  getDistrito,
};
