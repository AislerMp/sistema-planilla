export function soloAdministrador(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Debés iniciar sesión.",
    });
  }

  if (req.user.rol !== "ADMINISTRADOR") {
    return res.status(403).json({
      message: "No tenés permiso para esta acción.",
    });
  }

  next();
}

export async function isAuthenticate(req, res, next){
  if (!req.user) {
    return res.status(401).json({
      message: "Debés iniciar sesión.",
    });
  }
  next();
}