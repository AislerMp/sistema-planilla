import {
  getPuestos,
  getPuesto,
  createNewPuesto,
  updateTarifaPuesto,
  togglePuesto,
} from "../services/puestosService.js";
import { AppError } from "../utils/AppError.js";

export async function getPuestosController(req, res) {
  const puestos = await getPuestos();
  return res.status(200).json(puestos);
}

export async function getPuestoController(req, res) {
  const puesto = await getPuesto(req.params.id);
  return res.status(200).json(puesto);
}

export async function createPuestoController(req, res) {
  await createNewPuesto(req.body ?? {}, req.user?.UsuarioId);
  return res.status(201).json({ message: "Puesto registrado correctamente." });
}

export async function updateTarifaPuestoController(req, res) {
  const { tarifaHora } = req.body ?? {};
  // Una tarifa ausente no debe borrar la actual. null permite dejarla pendiente.
  if (tarifaHora === undefined) {
    throw new AppError("Debes proporcionar tarifaHora.", 400);
  }

  await updateTarifaPuesto(req.params.id, tarifaHora, req.user?.UsuarioId);
  return res.status(200).json({ message: "Tarifa del puesto actualizada correctamente." });
}

export async function togglePuestoController(req, res) {
  const { activo } = req.body ?? {};
  await togglePuesto(req.params.id, activo, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Estado del puesto actualizado correctamente.",
    activo,
  });
}
