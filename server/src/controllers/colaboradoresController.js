import {
  getColaboradores,
  getColaborador,
  createNewColaborador,
  updateExistingColaborador,
  toggleColaborador,
} from "../services/colaboradorService.js";

export async function getColaboradoresController(req, res) {
  const colaboradores = await getColaboradores();
  return res.status(200).json(colaboradores);
}

export async function getColaboradorByIdController(req, res) {
  const colaborador = await getColaborador(req.params.id);
  return res.status(200).json(colaborador);
}

export async function createColaboradorController(req, res) {
  const usuarioActorId = req.user?.UsuarioId;
  const colaboradorId = await createNewColaborador(req.body ?? {}, usuarioActorId);
  return res.status(201).json({
    message: "Colaborador registrado correctamente.",
    id: colaboradorId,
  });
}

export async function updateColaboradorController(req, res) {
  const usuarioActorId = req.user?.UsuarioId;
  const actualizado = await updateExistingColaborador(
    req.params.id,
    req.body ?? {},
    usuarioActorId
  );
  return res.status(200).json({
    message: "Colaborador actualizado correctamente.",
    actualizado,
  });
}

export async function desactivarColaboradorController(req, res) {
  const usuarioActorId = req.user?.UsuarioId;
  await toggleColaborador(req.params.id, false, usuarioActorId);
  return res.status(200).json({
    message: "Colaborador desactivado correctamente.",
    activo: false,
  });
}

export async function ActivarColaboradorController(req, res) {
  const usuarioActorId = req.user?.UsuarioId;
  await toggleColaborador(req.params.id, true, usuarioActorId);
  return res.status(200).json({
    message: "Estado del colaborador actualizado correctamente.",
    activo: true,
  });
}
