import {
  getRestaurantes,
  getRestaurante,
  createNewRestaurante,
  updateExistingRestaurante,
  toggleRestaurante,
  deactivateRestaurante,
} from "../services/restaurantesService.js";

export async function getRestaurantesController(req, res) {
  const restaurantes = await getRestaurantes();
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

export async function toggleRestauranteController(req, res) {
  const { activo } = req.body ?? {};
  await toggleRestaurante(req.params.id, activo, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Estado del restaurante actualizado correctamente.",
    activo,
  });
}

export async function deactivateRestauranteController(req, res) {
  await deactivateRestaurante(req.params.id, req.user?.UsuarioId);
  return res.status(200).json({
    message: "Restaurante desactivado correctamente.",
    activo: false,
  });
}
