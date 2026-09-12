import * as authRepository from "../repositories/authRepository.js";
import { hash, compare } from "bcrypt";
import { getRolById } from "../repositories/rolesRepository.js";
import { getColaboradorById } from "../repositories/colaboradorRepositorie.js";
import {
  validateId,
  validateText,
  serviceError,
} from "../utils/serviceUtils.js";
import { registrarBitacora } from "./bitacoraService.js";
import { beginTransaction } from "../config/database.js";

function validatePassword(password) {
  if (typeof password !== "string" || !password) {
    throw serviceError("La contraseña es obligatoria");
  }
  return password;
}

function safeUser(user) {
  return {
    UsuarioId: user.UsuarioId,
    NombreUsuario: user.NombreUsuario,
    RolId: user.RolId,
    ColaboradorId: user.ColaboradorId,
    FechaCreacion: user.FechaCreacion,
    Activo: user.Activo,
  };
}

export async function loginUser(username, password) {
  const nombreUsuario = validateText(username, "Nombre de usuario", 60);

  validatePassword(password);

  const user = await authRepository.getUserByUsername(nombreUsuario);
  if (!user || !user.Activo || !(await compare(password, user.PasswordHash))) {
    throw serviceError("Credenciales incorrectas", 401);
  }

  return safeUser(user);
}

export async function registerUser(user, usuarioActorId) {
  const actorId = validateId(usuarioActorId, "Usuario actorId");

  const nombreUsuario = validateText(
    user?.nombreUsuario,
    "Nombre de usuario",
    60,
  );
  const password = validatePassword(user?.password);
  const rolId = validateId(user?.rolId, "rolId");
  const colaboradorId = validateId(user?.colaboradorId, "colaboradorId");

  if (await authRepository.getUserByUsername(nombreUsuario, true)) {
    throw serviceError("El nombre de usuario ya está en uso", 409);
  }

  const rol = await getRolById(rolId);
  if (!rol) {
    throw serviceError("Rol no encontrado", 404);
  }

  const colaborador = await getColaboradorById(colaboradorId);
  if (!colaborador) {
    throw serviceError("Colaborador no encontrado", 404);
  }
  if (!colaborador.Activo) {
    throw serviceError("Colaborador está inactivo", 409);
  }
  if (await authRepository.getUserByColaboradorId(colaboradorId)) {
    throw serviceError("El colaborador ya tiene una cuenta vinculada", 409);
  }

  const passwordHash = await hash(password, 10);
  const transaction = await beginTransaction();
  try {
    const newUserId = await authRepository.createUser(
      {
        nombreUsuario,
        passwordHash,
        rolId,
        colaboradorId,
      },
      transaction,
    );

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: "Usuarios",
        registroId: newUserId,
        accion: "CREAR",
        datosAnteriores: null,
        datosNuevos: {
          nombreUsuario,
          rolId,
          colaboradorId,
        },
      },
      transaction,
    );

    await transaction.commit();
    return newUserId;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      console.error("No se pudo completar el rollback.");
    }
    throw error;
  }
}

export async function getUsers() {
  const users = await authRepository.getUsers();
  return users.map(safeUser);
}

export async function getUser(id) {
  const usuarioId = validateId(id);
  const user = await authRepository.getUserById(usuarioId);
  if (!user) {
    throw serviceError("Usuario no encontrado", 404);
  }
  if (!user.Activo) {
    throw serviceError("Usuario está inactivo", 409);
  }
  return safeUser(user);
}

// El controlador debe tomar el ID de la identidad autenticada.
export async function changePassword(
  id,
  currentPassword,
  newPassword,
) {
  const usuarioId = validateId(id);
  validatePassword(currentPassword);
  validatePassword(newPassword);

  const user = await authRepository.getUserById(usuarioId);
  if (!user) {
    throw serviceError("Usuario no encontrado", 404);
  }
  if (!user.Activo) {
    throw serviceError("Usuario está inactivo", 409);
  }
  if (!(await compare(currentPassword, user.PasswordHash))) {
    throw serviceError("Credenciales incorrectas", 401);
  }
  const passwordHash = await hash(newPassword, 10);
  const transaction = await beginTransaction();

  try {
    const actualizado = await authRepository.updatePassword(
      usuarioId,
      passwordHash,
      transaction
    );

    if (!actualizado) {
      throw serviceError("Usuario no encontrado o inactivo", 404);
    }

    await registrarBitacora({
      usuarioId: usuarioId,
      entidad: "Usuarios",
      registroId: usuarioId,
      accion: "CAMBIAR_CONTRASENA",
      datosAnteriores: { nombreUsuario: user.NombreUsuario },
      datosNuevos: { nombreUsuario: user.NombreUsuario, passwordActualizada: true },
    }, transaction);

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (error) {
      console.error("No se pudo completar el rollback.");
    }
    throw error;
  }
}
