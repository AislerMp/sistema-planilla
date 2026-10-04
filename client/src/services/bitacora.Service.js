import { parseResponse, crearQuery } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;
const endpoint = `${API_URL}/bitacoras`;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

// Fechas YYYY-MM-DD. El backend devuelve 50 registros por página.
export async function getBitacoras({
  pagina = 1,
  desde,
  hasta,
  usuarioId,
  entidad,
  registroId,
  accion,
} = {}) {
  
  ensureApiUrl();
  const datos = {
    pagina,
    desde,
    hasta,
    usuarioId,
    entidad,
    registroId,
    accion,
  };

  const params = crearQuery(datos);

  const response = await fetch(`${endpoint}?${params}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

export async function getBitacora(id) {
  ensureApiUrl();
  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });
  return parseResponse(response);
}

export default { getBitacoras, getBitacora };
