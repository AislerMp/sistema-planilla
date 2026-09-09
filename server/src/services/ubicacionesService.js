import * as ubicacionesRepository from "../repositories/ubicacionesRepository.js";
import { validateId, serviceError } from "../utils/serviceUtils.js";

export async function getProvincias() {
  return ubicacionesRepository.getProvincias();
}

export async function getProvincia(id) {
  const provinciaId = validateId(id, "provinciaId");
  const provincia = await ubicacionesRepository.getProvinciaById(provinciaId);
  if (!provincia) {
    throw serviceError("Provincia no encontrada", 404);
  }
  return provincia;
}

export async function getCantones(provinciaId) {
  const id = validateId(provinciaId, "provinciaId");
  await getProvincia(id);
  return ubicacionesRepository.getCantones(id);
}

export async function getCanton(id) {
  const cantonId = validateId(id, "cantonId");
  const canton = await ubicacionesRepository.getCantonById(cantonId);
  if (!canton) {
    throw serviceError("Cantón no encontrado", 404);
  }
  return canton;
}

export async function getDistritos(cantonId) {
  const id = validateId(cantonId, "cantonId");
  await getCanton(id);
  return ubicacionesRepository.getDistritos(id);
}

export async function getDistrito(id) {
  const distritoId = validateId(id, "distritoId");
  const distrito = await ubicacionesRepository.getDistritoById(distritoId);
  if (!distrito) {
    throw serviceError("Distrito no encontrado", 404);
  }
  return distrito;
}
