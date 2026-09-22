import * as authRepository from "./auth.repository.js";
import { hash, compare } from "bcrypt";
import { getColaboradorById } from "../colaboradores/colaboradores.repository.js";
import {
  validateId,
  validateText,
  validateStatus,
  serviceError,
} from "../../shared/utils/serviceUtils.js";
import { getRol } from "../roles/roles.service.js";
import { registrarBitacora } from "../bitacora/bitacora.service.js";
import { beginTransaction } from "../../shared/config/database.js";

function validatePassword(password) {
  if (typeof password !== "string" || !password) {
    throw serviceError("La contraseña es obligatoria");
  }
  return password;
}

async function safeUser(user) {
  const rol = await getRol(user.RolId);

  return {
    UsuarioId: user.UsuarioId,
    NombreUsuario: user.NombreUsuario,
    RolId: user.RolId,
    Rol: rol.Codigo,
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

  return await safeUser(user);
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

  const rol = await getRol(rolId);
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
  return await Promise.all(users.map(safeUser));
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
  return await safeUser(user);
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

async function actualizarEstadoUsuario(id, activo, usuarioActorId) {
  const usuarioId = validateId(id, "UsuarioId");
  const status = validateStatus(activo);
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const transaction = await beginTransaction();

  try {
    const usuarioAnterior = await authRepository.getUserByIdForUpdate(
      usuarioId,
      transaction,
    );

    if (!usuarioAnterior) {
      throw serviceError("Usuario no encontrado", 404);
    }

    const actualizado = await authRepository.actualizarEstadoUsuario(
      usuarioId,
      status,
      transaction,
    );

    if (!actualizado) {
      throw serviceError("Usuario no encontrado", 404);
    }

    await registrarBitacora(
      {
        usuarioId: actorId,
        entidad: "Usuarios",
        registroId: usuarioId,
        accion: status ? "ACTIVAR" : "DESACTIVAR",
        datosAnteriores: { activo: usuarioAnterior.Activo },
        datosNuevos: { activo: status },
      },
      transaction,
    );

    await transaction.commit();
    return actualizado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      console.error("No se pudo completar el rollback.");
    }
    throw error;
  }
}

export async function activarUsuario(id, usuarioActorId) {
  return actualizarEstadoUsuario(id, true, usuarioActorId);
}

export async function updateUser(id, user, usuarioActorId) {
  const usuarioId = validateId(id);
  const actorId = validateId(usuarioActorId, "usuarioActorId");
  const data = {
    nombreUsuario: validateText(user?.nombreUsuario, "Nombre de usuario", 60),
    rolId: validateId(user?.rolId, "rolId"),
    colaboradorId: validateId(user?.colaboradorId, "colaboradorId"),
  };
  await getRol(data.rolId);
  const transaction = await beginTransaction();
  try {
    const previous = await authRepository.getUserByIdForUpdate(usuarioId, transaction);
    if (!previous) throw serviceError("Usuario no encontrado", 404);
    if (!previous.Activo) throw serviceError("Activá el usuario antes de actualizarlo", 409);
    const duplicate = await authRepository.getUserByUsername(data.nombreUsuario, true, transaction);
    if (duplicate && duplicate.UsuarioId !== usuarioId) {
      throw serviceError("El nombre de usuario ya está en uso", 409);
    }
    const colaborador = await getColaboradorById(data.colaboradorId, transaction);
    if (!colaborador) throw serviceError("Colaborador no encontrado", 404);
    if (!colaborador.Activo) throw serviceError("Colaborador está inactivo", 409);
    const linked = await authRepository.getUserByColaboradorId(data.colaboradorId, transaction);
    if (linked && linked.UsuarioId !== usuarioId) {
      throw serviceError("El colaborador ya tiene una cuenta vinculada", 409);
    }
    const updated = await authRepository.updateUser(usuarioId, data, transaction);
    if (!updated) throw serviceError("Usuario no encontrado o inactivo", 404);
    await registrarBitacora({
      usuarioId: actorId,
      entidad: "Usuarios",
      registroId: usuarioId,
      accion: "ACTUALIZAR",
      datosAnteriores: {
        nombreUsuario: previous.NombreUsuario,
        rolId: previous.RolId,
        colaboradorId: previous.ColaboradorId,
      },
      datosNuevos: data,
    }, transaction);
    await transaction.commit();
    return updated;
  } catch (error) {
    try { await transaction.rollback(); }
    catch { console.error("No se pudo completar el rollback."); }
    throw error;
  }
}

export async function desactivarUsuario(id, usuarioActorId) {
  return actualizarEstadoUsuario(id, false, usuarioActorId);
}
