const PUBLIC_PATHS = ["/api/auth/login", "/login"];

export function soloAdministrador(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Debés iniciar sesión." });
  }

  if (req.user.Rol !== "ADMINISTRADOR") {
    return res.status(403).json({
      message: "No tenés permiso para esta acción.",
    });
  }
  next();
}

export function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ message: "Debés iniciar sesión." });

    if (!rolesPermitidos.includes(req.user.Rol)) {
      return res.status(403).json({
        message: "No tenés permiso para esta acción.",
      });
    }

    return next();
  };
}

export async function isAuthenticate(req, res, next) {
  const isPublicRoute =
    req.method === "OPTIONS" ||
    PUBLIC_PATHS.includes(req.originalUrl) ||
    PUBLIC_PATHS.includes(req.path);

  if (isPublicRoute) {
    return next();
  }

  const user = req.session?.user;

  if (!user) {
    return res.status(401).json({
      message: "Debés iniciar sesión.",
    });
  }

  if (!user.Activo)
    return res.status(401).json({
      message: "El usuario actual está BLOQUEADO",
    });
    
  req.user = user;
  next();
}
