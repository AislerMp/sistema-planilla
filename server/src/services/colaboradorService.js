import * as colaboradorRepository from "../repositories/colaboradorRepositorie.js";
import { getRestaurante } from "./restaurantesService.js";
import { getPuesto } from "./puestosService.js";
import { getDistrito } from "./ubicacionesService.js";
import { validateId, validateText, validateDate, validateStatus, serviceError } from "../utils/serviceUtils.js";

async function validateColaboradorData(colaborador) {
  const data = {
    identificacion: validateText(colaborador?.identificacion, "Identificación", 30),
    correo: validateText(colaborador?.correo, "Correo", 100),
    nombre: validateText(colaborador?.nombre, "Nombre", 100),
    apellido: validateText(colaborador?.apellido, "Apellido", 100),
    fechaIngreso: validateDate(colaborador?.fechaIngreso, "Fecha de ingreso"),
    fechaSalida: validateDate(colaborador?.fechaSalida, "Fecha de salida", true),
    restauranteId: validateId(colaborador?.restauranteId, "restauranteId"),
    puestoId: validateId(colaborador?.puestoId, "puestoId"),
    distritoId: validateId(colaborador?.distritoId, "distritoId", true),
    detalleDireccion: validateText(colaborador?.detalleDireccion, "Detalle de dirección", 300, true),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) throw serviceError("El correo no es válido");

  if (data.fechaSalida && data.fechaSalida < data.fechaIngreso) {
    throw serviceError("La fecha de salida no puede ser anterior a la fecha de ingreso");
  }

  const restaurante = await getRestaurante(data.restauranteId);
  if (!restaurante.Activo) {
    throw serviceError("Restaurante está inactivo", 409);
  }

  const puesto = await getPuesto(data.puestoId);
  if (!puesto.Activo) {
    throw serviceError("Puesto está inactivo", 409);
  }

  if (data.distritoId !== null) await getDistrito(data.distritoId);
  return data;
}

export async function getColaboradores() {
  return colaboradorRepository.getAllColaboradores();
}

export async function getColaborador(id) {
  const colaboradorId = validateId(id);
  const colaborador = await colaboradorRepository.getColaboradorById(colaboradorId);
  if (!colaborador) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  return colaborador;
}

export async function createNewColaborador(colaborador) {
  const data = await validateColaboradorData(colaborador);
  return colaboradorRepository.createColaborador(data);
}

export async function updateExistingColaborador(id, colaborador) {
  const colaboradorId = validateId(id);
  const data = await validateColaboradorData(colaborador);
  const actualizado = await colaboradorRepository.updateColaborador(colaboradorId, data);
  if (!actualizado) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  return actualizado;
}

export async function toggleColaborador(id, activo) {
  const colaboradorId = validateId(id);
  const status = validateStatus(activo);
  const actualizado = await colaboradorRepository.toggleColaboradorActivo(colaboradorId, status);
  if (!actualizado) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  return actualizado;
}
