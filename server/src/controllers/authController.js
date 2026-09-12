import { getUser, getUsers, loginUser, registerUser, changePassword } from "../services/authService.js";

export async function getUserController(req, res) {
  const user = await getUser(req.params.id);
  return res.status(200).json(user);
}

export async function getUsersController(req, res) {
  const users = await getUsers();
  return res.status(200).json(users);
}

export async function loginUserController(req, res) {
  const { nombreUsuario, password } = req.body ?? {};
  const user = await loginUser(nombreUsuario, password);

  // El servicio devuelve el registro completo: solo enviamos datos públicos.
  return res.status(200).json({
    message: "Credenciales verificadas correctamente.",
    user: {
      UsuarioId: user.UsuarioId,
      NombreUsuario: user.NombreUsuario,
      RolId: user.RolId,
      ColaboradorId: user.ColaboradorId,
      FechaCreacion: user.FechaCreacion,
      Activo: user.Activo,
    },
  });
}

export async function registerUserController(req, res) {
  const { nombreUsuario, password, rolId, colaboradorId } = req.body ?? {};
  const usuarioActorId = req.user?.UsuarioId;

  const usuarioId = await registerUser({
    nombreUsuario,
    password,
    rolId,
    colaboradorId,
  }, usuarioActorId);

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