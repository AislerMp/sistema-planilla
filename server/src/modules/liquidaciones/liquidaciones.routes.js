import { Router } from "express";

import * as liquidacionesController from "./liquidaciones.controller.js";

import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

// Todas las rutas del módulo están restringidas a estos perfiles.
router.use(permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"));

// Consultar liquidaciones con filtros opcionales.
router.get("/", liquidacionesController.listarLiquidacionesController);

// Consultar la única liquidación del colaborador.
router.get(
  "/colaboradores/:colaboradorId",
  liquidacionesController.obtenerLiquidacionPorColaboradorController,
);

// Calcular sin guardar registros.
router.post(
  "/colaboradores/:colaboradorId/calculo",
  liquidacionesController.calcularLiquidacionController,
);

// Confirmar y registrar. Exclusivamente RH.
router.post(
  "/colaboradores/:colaboradorId/confirmar",
  permitirRoles("RECURSOS_HUMANOS"),
  liquidacionesController.confirmarLiquidacionController,
);

// Mantener esta ruta después de las rutas específicas.
router.get(
  "/:liquidacionId",
  liquidacionesController.obtenerLiquidacionController,
);

export default router;
