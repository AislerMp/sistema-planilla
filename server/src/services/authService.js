import * as authRepository from "../repositories/authRepository.js";
import { hash, compare } from "bcrypt";
import { getRolById } from "../repositories/rolesRepository.js";
import { getColaboradorById } from "../repositories/colaboradorRepositorie.js";
import { validateId, validateText, serviceError } from "./serviceUtils.js";

function validatePassword(password) {
  if (typeof password !== "string" || !password) {
    throw serviceError("La contraseña es obligatoria");
  }
  return password;
}

export async function loginUser(username, password) {
  const nombreUsuario = validateText(username, "Nombre de usuario", 60);

  validatePassword(password);

  const user = await authRepository.getUserByUsername(nombreUsuario);
  if (!user || !user.Activo || !(await compare(password, user.PasswordHash))) {
    throw serviceError("Credenciales incorrectas", 401);
  }

  return publicUser(user);
}

export async function registerUser(user) {
  const nombreUsuario = validateText(user?.nombreUsuario, "Nombre de usuario", 60);
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
  return authRepository.createUser({ nombreUsuario, passwordHash, rolId, colaboradorId });
}

export async function getUsers() {
  return await authRepository.getUsers();
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
  return user;
}

// El controlador debe tomar el ID de la identidad autenticada.
export async function changePassword(id, currentPassword, newPassword) {
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
  const actualizado = await authRepository.updatePassword(usuarioId, passwordHash);
  if (!actualizado) {
    throw serviceError("Usuario no encontrado o inactivo", 404);
  }
  return actualizado;
}
