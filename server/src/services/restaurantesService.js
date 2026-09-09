import * as restaurantesRepository from "../repositories/restaurantesRepository.js";
import { getDistrito } from "./ubicacionesService.js";
import { validateId, validateText, validateStatus, serviceError } from "../utils/serviceUtils.js";

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

export async function getRestaurantes() {
  return restaurantesRepository.getRestaurantes();
}

export async function getRestaurante(id) {
  const restauranteId = validateId(id);
  const restaurante = await restaurantesRepository.getRestauranteById(restauranteId);
  if (!restaurante) {
    throw serviceError("Restaurante no encontrado", 404);
  }
  return restaurante;
}

export async function createNewRestaurante(restaurante) {
  const data = await validateRestaurante(restaurante);
  return restaurantesRepository.createRestaurante(data);
}

export async function updateExistingRestaurante(id, restaurante) {
  const restauranteId = validateId(id);
  const data = await validateRestaurante(restaurante);
  const existente = await getRestaurante(restauranteId);
  if (!existente.Activo) {
    throw serviceError("Restaurante está inactivo", 409);
  }
  const actualizado = await restaurantesRepository.updateRestaurante(restauranteId, data);
  if (!actualizado) {
    throw serviceError("Restaurante no encontrado o inactivo", 404);
  }
  return actualizado;
}

export async function toggleRestaurante(id, activo) {
  const restauranteId = validateId(id);
  const status = validateStatus(activo);
  const actualizado = await restaurantesRepository.toggleRestauranteActivo(restauranteId, status);
  if (!actualizado) {
    throw serviceError("Restaurante no encontrado", 404);
  }
  return actualizado;
}

export async function deactivateRestaurante(id) {
  return toggleRestaurante(id, false);
}
