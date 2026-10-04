import { crearQuery, parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/permisos-laborales`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

export async function getPermisoLaboralById(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// Fechas en formato YYYY-MM-DD.
export async function getMisPermisos({ desde, hasta, estado } = {}) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(`${endpoint}/mis-permisos${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPermisosPorRestaurante(
  restauranteId,
  { desde, hasta, estado } = {},
) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(
    `${endpoint}/restaurante/${encodeURIComponent(restauranteId)}${query}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

export async function getPermisosAdministracion({
  restauranteId,
  desde,
  hasta,
  estado,
} = {}) {
  ensureApiUrl();

  const query = crearQuery({ restauranteId, desde, hasta, estado });
  const response = await fetch(`${endpoint}/restaurante${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPermisosDeMiRestaurante({ desde, hasta, estado } = {}) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(
    `${endpoint}/restaurante/mi-restaurante${query}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

export async function solicitarPermisoLaboral({ fechaSolicitada, motivo }) {
  ensureApiUrl();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fechaSolicitada, motivo }),
  });

  return parseResponse(response);
}

// estado: APROBADA o RECHAZADA.
export async function resolverPermisoLaboral(id, { estado, observacion }) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${id}/resolver`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, observacion }),
    },
  );

  return parseResponse(response);
}
