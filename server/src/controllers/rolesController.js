import { getRoles, getRol } from "../services/rolesService.js";

export async function getRolesController(req, res) {
  const roles = await getRoles();
  return res.status(200).json(roles);
}

export async function getRolController(req, res) {
  const rol = await getRol(req.params.id);
  return res.status(200).json(rol);
}
