import * as permisosServices from "./permisosLaborales.service.js";

export async function obtenerPermisoPorId(req, res) {
  const permiso = await permisosServices.obtenerPermisoPorId(
    req.params.permisoId,
    req.user,
  );
  res.status(200).json(permiso);
}

export async function listarMisPermisosController(req, res) {
  const misPermisos = await permisosServices.listarMisPermisos(req.user, {
    desde: req.query.desde,
    hasta: req.query.hasta,
    estado: req.query.estado,
  });
  res.status(200).json(misPermisos);
}

export async function listarPermisosPorRestauranteController(req, res) {
  const permisos = await permisosServices.listarPermisosPorRestaurante(
    req.user,
    req.params.restauranteId,
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
  );
  res.status(200).json(permisos);
}

export async function listarPermisosAdministracionController(req, res) {
  const permisos = await permisosServices.listarPermisosAdministracion(
    req.user,
    req.query,
  );
  res.status(200).json(permisos);
}

export async function listarPermisosDeMiRestauranteController(req, res) {
  const permisos = await permisosServices.listarPermisosDeMiRestaurante(
    req.user,
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
  );
  res.status(200).json(permisos);
}

export async function crearPermisoLaboralController(req, res) {
  const permisoCreado = await permisosServices.solicitarPermiso(
    req.body ?? {},
    req.user,
  );
  res.status(201).json(permisoCreado);
}

export async function resolverPermisoLaboralController(req, res) {
  const permisoResuelto = await permisosServices.resolverPermiso(
    req.params.permisoId,
    req.body ?? {},
    req.user,
  );
  
  res.status(200).json(permisoResuelto);
}
