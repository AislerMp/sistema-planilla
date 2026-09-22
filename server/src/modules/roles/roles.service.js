import * as rolesRepository from "./roles.repository.js";
import { validateId, serviceError } from "../../shared/utils/serviceUtils.js";

export async function getRoles() {
  return rolesRepository.getRoles();
}

export async function getRol(id) {
  const rolId = validateId(id, "rolId");
  const rol = await rolesRepository.getRolById(rolId);
  if (!rol) {
    throw serviceError("Rol no encontrado", 404);
  }
  return rol;
}
