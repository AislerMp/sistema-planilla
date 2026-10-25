import { crearQuery, parseResponse, ensureApiUrl } from "../utils/helper.js";

const endpoint = `${import.meta.env.VITE_API_URL}/deducciones`;

async function consultar(url) {
  ensureApiUrl();
  const response = await fetch(url, { credentials: "include" });
  return parseResponse(response);
}

async function enviar(url, method, datos) {
  ensureApiUrl();
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(datos),
  });
  return parseResponse(response);
}

export function getDeducciones({ tipoDeduccion, codigo, fechaVigencia } = {}) {
  const query = crearQuery({ tipoDeduccion, codigo, fechaVigencia });
  return consultar(`${endpoint}/catalogo${query}`);
}

export function getDeduccionById(deduccionId) {
  return consultar(`${endpoint}/catalogo/${encodeURIComponent(deduccionId)}`);
}

export function crearDeduccion(datos) {
  return enviar(`${endpoint}/catalogo`, "POST", datos);
}

export function actualizarDatosDeduccion(deduccionId, datos) {
  return enviar(
    `${endpoint}/catalogo/${encodeURIComponent(deduccionId)}`,
    "PATCH",
    datos,
  );
}

export function crearVersionDeduccion(deduccionId, datos) {
  return enviar(
    `${endpoint}/catalogo/${encodeURIComponent(deduccionId)}/versiones`,
    "POST",
    datos,
  );
}

export function finalizarVigenciaDeduccion(deduccionId, fechaFin) {
  return enviar(
    `${endpoint}/catalogo/${encodeURIComponent(deduccionId)}/vigencia`,
    "PATCH",
    { fechaFin },
  );
}

export function getMisSolicitudesDeduccion({ desde, hasta, estado } = {}) {
  const query = crearQuery({ desde, hasta, estado });
  return consultar(`${endpoint}/mis-solicitudes${query}`);
}

// El gerente queda limitado a su restaurante; RH y Administración pueden omitir el ID.
export function getSolicitudesDeduccionPorRestaurante(
  restauranteId,
  { desde, hasta, estado } = {},
) {
  const query = crearQuery({ restauranteId, desde, hasta, estado });
  return consultar(`${endpoint}/restaurante${query}`);
}

export function getSolicitudDeduccionById(solicitudId) {
  return consultar(
    `${endpoint}/solicitudes/${encodeURIComponent(solicitudId)}`,
  );
}

export function solicitarDeduccion(datos) {
  return enviar(`${endpoint}/solicitudes`, "POST", datos);
}

export function resolverSolicitudDeduccionRh(
  solicitudId,
  { estado, observacion } = {},
) {
  return enviar(
    `${endpoint}/solicitudes/${encodeURIComponent(solicitudId)}/resolver-rh`,
    "PATCH",
    { estado, observacion },
  );
}
