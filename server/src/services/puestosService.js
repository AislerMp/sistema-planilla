import * as puestosRepository from "../repositories/puestosRepository.js";
import { validateId, validateText, validateStatus, serviceError } from "../utils/serviceUtils.js";
import { beginTransaction } from "../config/database.js";
import { registrarBitacora, entidades } from "./bitacoraService.js";

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

export async function createNewPuesto(puesto, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const data = {
    nombre: validateText(puesto?.nombre, "Nombre", 80),
    tarifaHora: validateTarifa(puesto?.tarifaHora !== undefined ? puesto.tarifaHora : puesto?.TarifaHora),
  };
  const transaction = await beginTransaction();
  try {
    const puestoId = await puestosRepository.crearPuesto(data, transaction);
    if (!puestoId) throw serviceError("No se pudo registrar el puesto", 500);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.PUESTOS,
      registroId: puestoId,
      accion: "CREAR",
      datosAnteriores: null,
      datosNuevos: data,
    }, transaction);

    await transaction.commit();
    return true;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}

export async function updateTarifaPuesto(id, tarifaHora, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const puestoId = validateId(id);
  const tarifa = validateTarifa(tarifaHora);
  const transaction = await beginTransaction();
  try {
    const puesto = await puestosRepository.getPuestoById(puestoId, transaction);
    if (!puesto) throw serviceError("Puesto no encontrado", 404);
    if (!puesto.Activo) throw serviceError("Puesto está inactivo", 409);

    const actualizado = await puestosRepository.updateTarifaPuesto(puestoId, tarifa, transaction);
    if (!actualizado) throw serviceError("Puesto no encontrado o inactivo", 404);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.PUESTOS,
      registroId: puestoId,
      accion: "CAMBIAR_TARIFA",
      datosAnteriores: { tarifaHora: puesto.TarifaHora },
      datosNuevos: { tarifaHora: tarifa },
    }, transaction);

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}

export async function togglePuesto(id, activo, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const puestoId = validateId(id);
  const status = validateStatus(activo);
  const transaction = await beginTransaction();
  try {
    const puesto = await puestosRepository.getPuestoById(puestoId, transaction);
    if (!puesto) throw serviceError("Puesto no encontrado", 404);

    const actualizado = await puestosRepository.togglePuestoActivo(puestoId, status, transaction);
    if (!actualizado) throw serviceError("Puesto no encontrado", 404);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.PUESTOS,
      registroId: puestoId,
      accion: status ? "ACTIVAR" : "DESACTIVAR",
      datosAnteriores: { activo: puesto.Activo },
      datosNuevos: { activo: status },
    }, transaction);

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("No se pudo completar el rollback.", rollbackError);
    }
    throw error;
  }
}
