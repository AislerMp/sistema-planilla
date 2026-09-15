import {
  getUser,
  getUsers,
  loginUser,
  registerUser,
  changePassword,
  activarUsuario,
  desactivarUsuario,
  updateUser,
} from "../services/authService.js";

export async function getUserController(req, res) {
  const user = await getUser(req.params.id);
  return res.status(200).json(user);
}

export async function getUsersController(req, res) {
  const users = await getUsers();
  return res.status(200).json(users);
}

export async function updateUserController(req, res) {
  await updateUser(req.params.id, req.body ?? {}, req.user?.UsuarioId);
  // Actualizar también esta sesión si el administrador editó su propia cuenta.
  if (Number(req.params.id) === req.user.UsuarioId) {
    req.session.user = await getUser(req.user.UsuarioId);
  }
  return res.status(200).json({ message: "Usuario actualizado correctamente." });
}

export async function loginUserController(req, res) {
  const { nombreUsuario, password } = req.body ?? {};
  const user = await loginUser(nombreUsuario, password);

  req.session.user = user;
  return res.status(200).json({
    message: "Credenciales verificadas correctamente",
    user: req.session.user,
  });
}

export async function registerUserController(req, res) {
  const { nombreUsuario, password, rolId, colaboradorId } = req.body ?? {};
  const usuarioActorId = req.user?.UsuarioId;

  const usuarioId = await registerUser(
    {
      nombreUsuario,
      password,
      rolId,
      colaboradorId,
    },
    usuarioActorId,
  );

  return res.status(201).json({
    message: "Usuario registrado correctamente.",
    UsuarioId: usuarioId,
  });
}

export async function changePasswordController(req, res) {
  // req.user debe ser establecido por el middleware que autentique la petición.
  // Nunca usamos un ID enviado en el body o la URL para cambiar la contraseña.
  const { currentPassword, newPassword } = req.body ?? {};
  await changePassword(req.user.UsuarioId, currentPassword, newPassword);

  return res.status(200).json({
    message: "Contraseña actualizada correctamente.",
  });
}

export async function getCurrentUserController(req, res) {
  return res.status(200).json({
    user: req.user,
  });
}

export async function logoutController(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });

    return res.status(200).json({
      message: "Sesión cerrada correctamente.",
    });
  });
}

export async function activarUsuarioController(req, res) {
  await activarUsuario(req.params.id, req.user?.UsuarioId);

  return res.status(200).json({
    message: "Usuario activado correctamente.",
    activo: true,
  });
}

export async function desactivarUsuarioController(req, res) {
  await desactivarUsuario(req.params.id, req.user?.UsuarioId);

  return res.status(200).json({
    message: "Usuario desactivado correctamente.",
    activo: false,
  });
}
