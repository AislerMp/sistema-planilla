import * as permisosLaboralesController from "./permisosLaborales.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";
import { Router } from "express";

const router = Router();

router.get(
  "/restaurante/mi-restaurante",
  permitirRoles("GERENTE"),
  permisosLaboralesController.listarPermisosDeMiRestauranteController,
);

router.get(
  "/mis-permisos",
  permitirRoles("COLABORADOR"),
  permisosLaboralesController.listarMisPermisosController,
);

router.get(
  "/restaurante",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.listarPermisosAdministracionController,
);

router.get(
  "/restaurante/:restauranteId",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.listarPermisosPorRestauranteController,
);

router.get(
  "/:permisoId",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.obtenerPermisoPorId,
);

router.post(
  "/",
  permitirRoles("COLABORADOR"),
  permisosLaboralesController.crearPermisoLaboralController,
);

router.patch(
  "/:permisoId/resolver",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.resolverPermisoLaboralController,
);

export default router;
