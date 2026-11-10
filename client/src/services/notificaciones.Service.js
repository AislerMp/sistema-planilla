import { ensureApiUrl, parseResponse } from "../utils/helper.js";

export async function getNotificaciones(signal) {
  ensureApiUrl();

  const respuesta = await fetch(
    `${import.meta.env.VITE_API_URL}/notificaciones`,
    {
      credentials: "include",
      signal,
    },
  );

  return parseResponse(respuesta);
}