const PUBLIC_PATHS = ["/api/auth/login", "/login", "/api/health", "/health"];

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

  req.user = user;
  next();
}
