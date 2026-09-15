import * as restaurantesRepository from "../repositories/restaurantesRepository.js";
import { validateId, validateText, validateStatus, serviceError } from "../utils/serviceUtils.js";
import { beginTransaction } from "../config/database.js";
import { registrarBitacora, entidades } from "./bitacoraService.js";

async function validateRestaurante(restaurante) {
  const data = {
    nombre: validateText(restaurante?.nombre, "Nombre", 100),
    distritoId: validateId(restaurante?.distritoId, "distritoId", true),
    detalleDireccion: validateText(restaurante?.detalleDireccion, "Detalle de dirección", 300, true),
  };
  if ((data.distritoId === null) !== (data.detalleDireccion === null)) {
    throw serviceError("El distrito y el detalle de dirección deben proporcionarse juntos");
  }
  return data;
}

export async function getRestaurantes(incluirInactivos = false) {
  return restaurantesRepository.getRestaurantes(incluirInactivos);
}

export async function getRestaurante(id) {
  const restauranteId = validateId(id);
  const restaurante = await restaurantesRepository.getRestauranteById(restauranteId);
  if (!restaurante) {
    throw serviceError("Restaurante no encontrado", 404);
  }
  return restaurante;
}

export async function createNewRestaurante(restaurante, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const data = await validateRestaurante(restaurante);
  const transaction = await beginTransaction();
  try {
    const restauranteId = await restaurantesRepository.createRestaurante(data, transaction);
    if (!restauranteId) throw serviceError("No se pudo registrar el restaurante", 500);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.RESTAURANTE,
      registroId: restauranteId,
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

export async function updateExistingRestaurante(id, restaurante, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const restauranteId = validateId(id);
  const data = await validateRestaurante(restaurante);
  const transaction = await beginTransaction();
  try {
    const existente = await restaurantesRepository.getRestauranteById(restauranteId, transaction);
    if (!existente) throw serviceError("Restaurante no encontrado", 404);
    if (!existente.Activo) throw serviceError("Restaurante está inactivo", 409);

    const actualizado = await restaurantesRepository.updateRestaurante(restauranteId, data, transaction);
    if (!actualizado) throw serviceError("Restaurante no encontrado o inactivo", 404);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.RESTAURANTE,
      registroId: restauranteId,
      accion: "ACTUALIZAR",
      datosAnteriores: {
        nombre: existente.Nombre,
        distritoId: existente.DistritoId,
        detalleDireccion: existente.DetalleDireccion,
      },
      datosNuevos: data,
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

async function actualizarEstadoRestaurante(id, activo, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const restauranteId = validateId(id);
  const status = validateStatus(activo);
  const transaction = await beginTransaction();
  try {
    const existente = await restaurantesRepository.getRestauranteById(restauranteId, transaction);
    if (!existente) throw serviceError("Restaurante no encontrado", 404);

    const actualizado = await restaurantesRepository.actualizarEstadoRestaurante(restauranteId, status, transaction);
    if (!actualizado) throw serviceError("Restaurante no encontrado", 404);

    await registrarBitacora({
      usuarioId: actorId,
      entidad: entidades.RESTAURANTE,
      registroId: restauranteId,
      accion: status ? "ACTIVAR" : "DESACTIVAR",
      datosAnteriores: { activo: existente.Activo },
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

export async function activarRestaurante(id, usuarioActorId) {
  return actualizarEstadoRestaurante(id, true, usuarioActorId);
}

export async function desactivarRestaurante(id, usuarioActorId) {
  return actualizarEstadoRestaurante(id, false, usuarioActorId);
}
