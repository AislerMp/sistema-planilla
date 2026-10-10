import { crearQuery, parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/incapacidades`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

export async function getTiposIncapacidades() {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/tipos`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getMisIncapacidades({ desde, hasta, estado } = {}) {
  ensureApiUrl();

  const query = crearQuery({ desde, hasta, estado });
  const response = await fetch(`${endpoint}/mis-incapacidades${query}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getIncapacidadById(id) {
  ensureApiUrl();

  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

// El gerente puede omitir restauranteId; RH y Administración deben indicarlo.
export async function getIncapacidadesPorRestaurante(
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

export async function getCalculoIncapacidad(id) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(id)}/calculo`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  return parseResponse(response);
}

// comprobante es el File del input (input.files[0]); fechas YYYY-MM-DD.
export async function solicitarIncapacidad({
  restauranteId,
  tipoIncapacidadId,
  numeroDocumento,
  fechaInicio,
  fechaFin,
  motivo,
  comprobante,
} = {}) {
  ensureApiUrl();

  if (!(comprobante instanceof Blob)) {
    throw new Error("Debe adjuntar el comprobante de la incapacidad");
  }

  const datos = new FormData();
  const campos = {
    restauranteId,
    tipoIncapacidadId,
    numeroDocumento,
    fechaInicio,
    fechaFin,
    motivo,
  };

  for (const [campo, valor] of Object.entries(campos)) {
    if (valor !== undefined && valor !== null) datos.append(campo, valor);
  }
  datos.append("comprobante", comprobante);

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    body: datos,
  });

  return parseResponse(response);
}

// estado: EN_REVISION_RH o RECHAZADA. El backend obtiene el revisor de la sesión.
export async function revisarIncapacidadGerente(
  id,
  { estado, observacion } = {},
) {
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

// estado: APROBADA o RECHAZADA.
export async function resolverIncapacidadRh(id, { estado, observacion } = {}) {
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

// Devuelve un Blob; la pantalla decide cómo descargarlo o mostrarlo.
// El nombre original está en ComprobanteNombre del detalle de la solicitud.
export async function descargarComprobanteIncapacidad(id) {
  ensureApiUrl();

  const response = await fetch(
    `${endpoint}/${encodeURIComponent(id)}/comprobante`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) return parseResponse(response);
  return response.blob();
}
