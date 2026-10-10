import { Router } from "express";
import * as incapacidadesController from "./incapacidades.controller.js";
import { recibirComprobante } from "./incapacidades.upload.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/tipos",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  incapacidadesController.getTiposIncapacidadesController,
);

router.get(
  "/mis-incapacidades",
  permitirRoles("COLABORADOR"),
  incapacidadesController.getMisIncapacidades,
);

router.get(
  ["/restaurante", "/restaurante/:restauranteId"],
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  incapacidadesController.getIncapacidadesByRestauranteController,
);

router.get(
  "/:id/calculo",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  incapacidadesController.getCalculoIncapacidadController,
);

router.get(
  "/:id/comprobante",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  incapacidadesController.descargarComprobanteController,
);

router.get(
  "/:id",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  incapacidadesController.getIncapacidadController,
);

router.post(
  "/",
  permitirRoles("COLABORADOR"),
  recibirComprobante,
  incapacidadesController.crearIncapacidadController,
);

router.patch(
  "/:id/revisar-gerente",
  permitirRoles("GERENTE"),
  incapacidadesController.revisarIncapacidadGerenteController,
);

router.patch(
  "/:id/resolver-rh",
  permitirRoles("RECURSOS_HUMANOS"),
  incapacidadesController.resolverIncapacidadRhController,
);

export default router;
