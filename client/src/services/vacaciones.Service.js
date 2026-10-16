import { crearQuery, parseResponse, ensureApiUrl } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/vacaciones`;

// Fechas en formato YYYY-MM-DD; el colaborador se obtiene de la sesión.
export async function getMisVacaciones({ desde, hasta, estado } = {}) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(`${endpoint}/mis-vacaciones${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getVacacionById(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// El gerente queda limitado a su restaurante; RH y Administración pueden omitirlo.
export async function getVacacionesPorRestaurante(
  restauranteId,
  { desde, hasta, estado } = {},
) {
  ensureApiUrl();

  const query = crearQuery({ restauranteId, desde, hasta, estado });
  const response = await fetch(`${endpoint}/restaurante${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function solicitarVacaciones({ fechaInicio, fechaFin, motivo } = {}) {
  ensureApiUrl();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fechaInicio, fechaFin, motivo }),
  });

  return parseResponse(response);
}

// estado: EN_REVISION_RH o RECHAZADA. El revisor se obtiene de la sesión.
export async function revisarVacacionesGerente(id, { estado, observacion } = {}) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(id)}/revisar-gerente`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, observacion }),
    },
  );

  return parseResponse(response);
}

// estado: APROBADA o RECHAZADA. Devuelve la solicitud y sus cálculos.
export async function resolverVacacionesRh(id, { estado, observacion } = {}) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(id)}/resolver-rh`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado, observacion }),
    },
  );

  return parseResponse(response);
}

export async function revertirVacaciones(id, { motivo } = {}) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/revertir`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ motivo }),
  });

  return parseResponse(response);
}

export async function getMiSaldoVacaciones() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/mi-saldo`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// Consulta por colaborador disponible para RH y Administración.
export async function getSaldoVacacionesByColaborador(colaboradorId) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/saldos/${encodeURIComponent(colaboradorId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

