import * as aguinaldoController from "./aguinaldo.controller.js";
import { Router } from "express";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/",
  permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS"),
  aguinaldoController.listarAguinaldosController,
);

router.get(
  "/detalles",
  permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS", "GERENTE", "COLABORADOR"),
  aguinaldoController.listarDetallesAguinaldoController,
);

router.get(
  "/anios/:anio/calculo",
  permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS", "GERENTE", "COLABORADOR"),
  aguinaldoController.calcularAguinaldoController,
);

router.post(
  "/anios/:anio/confirmar",
  permitirRoles("RECURSOS_HUMANOS"),
  aguinaldoController.confirmarAguinaldoController,
);

router.get(
  "/:aguinaldoId",
  permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS"),
  aguinaldoController.obtenerAguinaldoController,
);

export default router;