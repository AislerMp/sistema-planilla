import { Router } from "express";
import * as vacacionesController from "./vacaciones.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/mis-vacaciones",
  permitirRoles("COLABORADOR"),
  vacacionesController.getMisVacacionesController,
);

router.get(
  "/mi-saldo",
  permitirRoles("COLABORADOR"),
  vacacionesController.getMiSaldoVacacionesController,
);

router.get(
  "/saldos/:colaboradorId",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  vacacionesController.getSaldoVacacionesByColaboradorController,
);

router.get(
  ["/restaurante", "/restaurante/:restauranteId"],
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  vacacionesController.getVacacionesByRestauranteController,
);

router.get(
  "/:id",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  vacacionesController.getVacacionController,
);

router.post(
  "/",
  permitirRoles("COLABORADOR"),
  vacacionesController.crearVacacionesController,
);

router.patch(
  "/:id/revisar-gerente",
  permitirRoles("GERENTE"),
  vacacionesController.revisarVacacionesGerenteController,
);

router.patch(
  "/:id/resolver-rh",
  permitirRoles("RECURSOS_HUMANOS"),
  vacacionesController.resolverVacacionesRhController,
);

router.patch(
  "/:id/revertir",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS"),
  vacacionesController.revertirVacacionesController,
);

export default router;
