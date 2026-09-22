import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

const endpoint = `${API_URL}/colaboradores`;

export async function getColaboradores({ restauranteId } = {}) {
  ensureApiUrl();

  const params = new URLSearchParams();
  if (restauranteId !== undefined && restauranteId !== null && restauranteId !== "") {
    params.set("restauranteId", restauranteId);
  }
  const query = params.toString();

  const response = await fetch(`${endpoint}/${query ? `?${query}` : ""}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getColaborador(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function activateColaborador(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/activate/${id}`, {
    method: "POST",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function createColaborador({
  identificacion,
  correo,
  nombre,
  apellido,
  fechaIngreso,
  fechaSalida,
  restauranteId,
  puestoId,
  distritoId,
  detalleDireccion,
}) {
  ensureApiUrl();

  const colaborador = {
    identificacion,
    correo,
    nombre,
    apellido,
    fechaIngreso,
    fechaSalida,
    restauranteId,
    puestoId,
    distritoId,
    detalleDireccion,
  };

  const response = await fetch(`${endpoint}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(colaborador),
  });

  return parseResponse(response);
}

export async function updateColaborador(
  id,
  {
    identificacion,
    correo,
    nombre,
    apellido,
    fechaIngreso,
    fechaSalida,
    restauranteId,
    puestoId,
    distritoId,
    detalleDireccion,
  },
) {
  ensureApiUrl();

  // PUT recibe los datos completos del formulario, igual que al crear.
  const colaborador = {
    identificacion,
    correo,
    nombre,
    apellido,
    fechaIngreso,
    fechaSalida,
    restauranteId,
    puestoId,
    distritoId,
    detalleDireccion,
  };

  const response = await fetch(`${endpoint}/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(colaborador),
  });

  return parseResponse(response);
}

export async function deactivateColaborador(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  getColaboradores,
  getColaborador,
  activateColaborador,
  createColaborador,
  updateColaborador,
  deactivateColaborador,
};
