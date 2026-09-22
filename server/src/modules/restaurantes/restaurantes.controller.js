import {
  getRestaurantes,
  getRestaurante,
  createNewRestaurante,
  updateExistingRestaurante,
  activarRestaurante,
  desactivarRestaurante,
} from "./restaurantes.service.js";

export async function getRestaurantesController(req, res) {
  const restaurantes = await getRestaurantes(req.query?.estado === "todos");
  return res.status(200).json(restaurantes);
}

export async function getRestauranteController(req, res) {
  const restaurante = await getRestaurante(req.params.id);
  return res.status(200).json(restaurante);
}

export async function createRestauranteController(req, res) {
  await createNewRestaurante(req.body ?? {}, req.user?.UsuarioId);
  return res.status(201).json({ message: "Restaurante registrado correctamente." });
}

export async function updateRestauranteController(req, res) {
  await updateExistingRestaurante(req.params.id, req.body ?? {}, req.user?.UsuarioId);
  return res.status(200).json({ message: "Restaurante actualizado correctamente." });
}

export async function activarRestauranteController(req, res) {
  await activarRestaurante(req.params.id, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Restaurante activado correctamente.",
    activo: true,
  });
}

export async function desactivarRestauranteController(req, res) {
  await desactivarRestaurante(req.params.id, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Restaurante desactivado correctamente.",
    activo: false,
  });
}
