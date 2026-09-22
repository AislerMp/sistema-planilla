import * as asistenciasController from "./asistenciasDiarias.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";
import { Router } from "express";

const router = Router();

router.get(
  "/colaborador",
  permitirRoles("COLABORADOR"),
  asistenciasController.listarAsistenciasPorColaboradorController,
);

router.use(permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"));

router.get(
  "/restaurante",
  asistenciasController.listarAsistenciasPorRestauranteController,
);

router.get("/:id", asistenciasController.obtenerAsistenciaController);

router.patch("/:id/minutos", asistenciasController.ajustarMinutosAsistenciaController);

export default router;
