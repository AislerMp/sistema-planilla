import * as permisosLaboralesController from "./permisosLaborales.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";
import { Router } from "express";

const router = Router();

router.get(
  "/mis-permisos",
  permitirRoles("COLABORADOR"),
  permisosLaboralesController.listarMisPermisosController,
);

router.get(
  ["/restaurante", "/restaurante/:restauranteId"],
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.listarPermisosPorRestauranteController,
);

router.get(
  "/:solicitudId",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  permisosLaboralesController.obtenerPermisoPorId,
);

router.post(
  "/",
  permitirRoles("COLABORADOR"),
  permisosLaboralesController.crearPermisoLaboralController,
);

router.patch(
  "/:solicitudId/resolver",
  permitirRoles("GERENTE"),
  permisosLaboralesController.resolverPermisoLaboralController,
);

export default router;
