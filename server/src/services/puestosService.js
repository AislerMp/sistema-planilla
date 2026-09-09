import * as puestosRepository from "../repositories/puestosRepository.js";
import { validateId, validateText, validateStatus, serviceError } from "../utils/serviceUtils.js";

function validateTarifa(value) {
  if (value === undefined || value === null || value === "") return null;
  // DECIMAL(12,2): diez dígitos enteros y hasta dos decimales.
  const text = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw serviceError("La tarifa debe ser positiva, con hasta diez dígitos enteros y dos decimales");
  }
  return Number(text);
}

export async function getPuestos() {
  return puestosRepository.getPuestos();
}

export async function getPuesto(id) {
  const puestoId = validateId(id);
  const puesto = await puestosRepository.getPuestoById(puestoId);
  if (!puesto) {
    throw serviceError("Puesto no encontrado", 404);
  }
  return puesto;
}

export async function createNewPuesto(puesto) {
  const data = {
    nombre: validateText(puesto?.nombre, "Nombre", 80),
    tarifaHora: validateTarifa(puesto?.tarifaHora !== undefined ? puesto.tarifaHora : puesto?.TarifaHora),
  };
  return puestosRepository.crearPuesto(data);
}

export async function updateTarifaPuesto(id, tarifaHora) {
  const puestoId = validateId(id);
  const tarifa = validateTarifa(tarifaHora);
  const puesto = await getPuesto(puestoId);
  if (!puesto.Activo) {
    throw serviceError("Puesto está inactivo", 409);
  }
  const actualizado = await puestosRepository.updateTarifaPuesto(puestoId, tarifa);
  if (!actualizado) {
    throw serviceError("Puesto no encontrado o inactivo", 404);
  }
  return actualizado;
}

export async function togglePuesto(id, activo) {
  const puestoId = validateId(id);
  const status = validateStatus(activo);
  const actualizado = await puestosRepository.togglePuestoActivo(puestoId, status);
  if (!actualizado) {
    throw serviceError("Puesto no encontrado", 404);
  }
  return actualizado;
}
