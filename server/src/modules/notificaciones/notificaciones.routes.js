import { Router } from "express";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";
import { listarNotificacionesController } from "./notificaciones.controller.js";

const router = Router();

router.get(
  "/",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS"),
  listarNotificacionesController,
);

export default router;
