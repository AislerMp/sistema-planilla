import { parseResponse, ensureApiUrl } from "../utils/helper.js";

const endpoint = `${import.meta.env.VITE_API_URL}/planillas`;


export async function getPlanillas() {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// El colaborador se obtiene de la sesión.
export async function getMisDetallesPlanilla(periodoId) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/mis-detalles/${encodeURIComponent(periodoId)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// Para el gerente: sin período consulta el historial de su restaurante.
export async function getDetallesPlanillaRestaurante(periodoId = null) {
  ensureApiUrl();
  const rutaPeriodo = periodoId == null || periodoId === ""
    ? ""
    : `/${encodeURIComponent(periodoId)}`;

  const response = await fetch(`${endpoint}/restaurante${rutaPeriodo}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getPlanillaById(planillaId) {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/${encodeURIComponent(planillaId)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getConceptosPlanilla(detalleId) {
  ensureApiUrl();
  const response = await fetch(
    `${endpoint}/detalles/${encodeURIComponent(detalleId)}/conceptos`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// La vista previa se calcula en el servidor y no registra el pago.
export async function calcularPreplanilla(periodoId) {
  ensureApiUrl();
  const response = await fetch(
    `${endpoint}/periodos/${encodeURIComponent(periodoId)}/preplanilla`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// Para RH y Administración. Devuelve { planilla, detalles }.
// Sin restauranteId incluye todos los restaurantes del período.
export async function getPlanillaConDetalles(periodoId, restauranteId = null) {
  ensureApiUrl();
  const rutaDetalles = restauranteId == null || restauranteId === "" || restauranteId === "todos"
    ? "/detalles"
    : `/restaurantes/${encodeURIComponent(restauranteId)}`;

  const response = await fetch(
    `${endpoint}/periodos/${encodeURIComponent(periodoId)}${rutaDetalles}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// El servidor toma el usuario de la sesión y calcula los importes.
export async function registrarPagoPlanilla(periodoId) {
  ensureApiUrl();
  const response = await fetch(
    `${endpoint}/periodos/${encodeURIComponent(periodoId)}/pagar`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

