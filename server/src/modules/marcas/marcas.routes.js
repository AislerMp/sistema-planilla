import * as marcasController from "./marcas.controller.js";
import { Router } from "express";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/mis-marcas",
  permitirRoles("COLABORADOR"),
  marcasController.getMisMarcasController,
);

router.get(
  "/colaborador/:id",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  marcasController.getMarcasColaboradorByGerente,
);

router.post(
  "/entrada",
  permitirRoles("COLABORADOR"),
  marcasController.registrarEntradaController,
);

router.post(
  "/salida",
  permitirRoles("COLABORADOR"),
  marcasController.registrarSalidaController,
);

export default router;
