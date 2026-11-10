import { listarNotificaciones } from "./notificaciones.service.js";

export async function listarNotificacionesController(req, res) {
  const notificaciones = await listarNotificaciones(req.user);

  res.set("Cache-Control", "no-store");
  return res.status(200).json(notificaciones);
}