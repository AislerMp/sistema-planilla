import * as colaboradorRepository from "../repositories/colaboradorRepositorie.js";
import { getRestaurante } from "./restaurantesService.js";
import { getPuesto } from "./puestosService.js";
import { getDistrito } from "./ubicacionesService.js";
import {
  validateId,
  validateText,
  validateDate,
  validateStatus,
  serviceError,
} from "../utils/serviceUtils.js";
import { beginTransaction } from "../config/database.js";
import { registrarBitacora, entidades } from "./bitacoraService.js";

async function validateColaboradorData(colaborador) {
  const data = {
    identificacion: validateText(
      colaborador?.identificacion,
      "Identificación",
      30,
    ),
    correo: validateText(colaborador?.correo, "Correo", 100),
    nombre: validateText(colaborador?.nombre, "Nombre", 100),
    apellido: validateText(colaborador?.apellido, "Apellido", 100),
    fechaIngreso: validateDate(colaborador?.fechaIngreso, "Fecha de ingreso"),
    fechaSalida: validateDate(
      colaborador?.fechaSalida,
      "Fecha de salida",
      true,
    ),
    restauranteId: validateId(colaborador?.restauranteId, "restauranteId"),
    puestoId: validateId(colaborador?.puestoId, "puestoId"),
    distritoId: validateId(colaborador?.distritoId, "distritoId", true),
    detalleDireccion: validateText(
      colaborador?.detalleDireccion,
      "Detalle de dirección",
      300,
      true,
    ),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo))
    throw serviceError("El correo no es válido");

  if (data.fechaSalida && data.fechaSalida < data.fechaIngreso) {
    throw serviceError(
      "La fecha de salida no puede ser anterior a la fecha de ingreso",
    );
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
  const colaborador =
    await colaboradorRepository.getColaboradorById(colaboradorId);
  if (!colaborador) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  return colaborador;
}

export async function createNewColaborador(colaborador, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const data = await validateColaboradorData(colaborador);
  const transaction = await beginTransaction();

  try {
    const colaboradorCreadoId = await colaboradorRepository.createColaborador(
      data,
      transaction,
    );

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.COLABORADORES,
        registroId: colaboradorCreadoId,
        accion: "CREAR",
        datosNuevos: data,
        datosAnteriores: null,
      },
      transaction,
    );

    await transaction.commit();
    return colaboradorCreadoId;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error("Error al hacer rollback de la transacción:", error);
    }
    throw error;
  }
}

export async function updateExistingColaborador(
  id,
  colaborador,
  usuarioActorId,
) {
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const colaboradorId = validateId(id);
  const data = await validateColaboradorData(colaborador);

  const transaction = await beginTransaction();
  try {
    const colaboradorAnterior = await colaboradorRepository.getColaboradorById(
      colaboradorId,
      transaction,
    );

    if (!colaboradorAnterior) {
      throw serviceError("Colaborador no encontrado", 404);
    }

    const actualizado = await colaboradorRepository.updateColaborador(
      colaboradorId,
      data,
      transaction,
    );

    if (!actualizado) {
      throw serviceError("Colaborador no encontrado", 404);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.COLABORADORES,
        registroId: colaboradorId,
        accion: "ACTUALIZAR",
        datosNuevos: data,
        datosAnteriores: colaboradorAnterior,
      },
      transaction,
    );

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error("Error al hacer rollback de la transacción:", error);
    }
    throw error;
  }
}

export async function toggleColaborador(id, activo, usuarioActorId) {
  const colaboradorId = validateId(id);
  const status = validateStatus(activo);
  const actorId = validateId(usuarioActorId, "usuarioActorId");

  const transaction = await beginTransaction();
  try {
    const colaboradorAnterior = await colaboradorRepository.getColaboradorById(
      colaboradorId,
      transaction,
    );

    if (!colaboradorAnterior) {
      throw serviceError("Colaborador no encontrado", 404);
    }

    const actualizado = await colaboradorRepository.toggleColaboradorActivo(
      colaboradorId,
      status,
      transaction,
    );

    if (!actualizado) {
      throw serviceError("Colaborador no encontrado", 404);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: entidades.COLABORADORES,
        registroId: colaboradorId,
        accion: status ? "ACTIVAR" : "DESACTIVAR",
        datosNuevos: { activo: status },
        datosAnteriores: { activo: colaboradorAnterior.Activo },
      },
      transaction,
    );

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error("Error al hacer rollback de la transacción:", error);
    }
    throw error;
  }
}
