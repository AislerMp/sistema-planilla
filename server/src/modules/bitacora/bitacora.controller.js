import { listarBitacoras, obtenerBitacora } from "./bitacora.service.js";

export async function listarBitacorasController(req, res) {
  const bitacoras = await listarBitacoras({
    pagina: req.query.pagina,
    desde: req.query.desde,
    hasta: req.query.hasta,
    usuarioId: req.query.usuarioId,
    entidad: req.query.entidad,
    registroId: req.query.registroId,
    accion: req.query.accion,
  });

  return res.status(200).json(bitacoras);
}

export async function obtenerBitacoraController(req, res) {
  const bitacora = await obtenerBitacora(req.params.id);

  return res.status(200).json(bitacora);
}
