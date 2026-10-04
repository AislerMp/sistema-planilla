import { parseResponse, crearQuery } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/extras/solicitudes`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

export async function getSolicitud(id) {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/${id}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

// Consulta las solicitudes del colaborador autenticado; fechas YYYY-MM-DD.
export async function getMisSolicitudes({ desde, hasta, estado } = {}) {
  ensureApiUrl();
  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(`${endpoint}/mis-solicitudes${query}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

export async function getSolicitudesPorRestaurante({
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

export async function createSolicitud({ fechaSolicitada, minutosSolicitados, motivo }) {
  ensureApiUrl();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fechaSolicitada, minutosSolicitados, motivo }),
  });
  return parseResponse(response);
}

// estado: APROBADA o RECHAZADA.
export async function resolverSolicitud(id, { estado, minutosAutorizados, observacion }) {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/${id}/resolver`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ estado, minutosAutorizados, observacion }),
  });
  return parseResponse(response);
}

// idAsistencia identifica la jornada cuyas horas extras se ajustan.
export async function actualizarHorasExtra(idAsistencia, { minutosAjustados, motivo }) {
  ensureApiUrl();
  const response = await fetch(`${API_URL}/extras/asistencias/${idAsistencia}/minutos`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ minutosAjustados, motivo }),
  });
  return parseResponse(response);
}

export default {
  actualizarHorasExtra,
  getSolicitud,
  getMisSolicitudes,
  getSolicitudesPorRestaurante,
  createSolicitud,
  resolverSolicitud,
};
