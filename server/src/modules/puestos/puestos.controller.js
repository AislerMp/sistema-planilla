import {
  getPuestos,
  getPuesto,
  createNewPuesto,
  updateTarifaPuesto,
  activarPuesto,
  desactivarPuesto,
} from "./puestos.service.js";
import { AppError } from "../../shared/utils/AppError.js";

export async function getPuestosController(req, res) {
  const puestos = await getPuestos(req.query?.estado === "todos");
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

export async function activarPuestoController(req, res) {
  await activarPuesto(req.params.id, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Puesto activado correctamente.",
    activo: true,
  });
}

export async function desactivarPuestoController(req, res) {
  await desactivarPuesto(req.params.id, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Puesto desactivado correctamente.",
    activo: false,
  });
}
