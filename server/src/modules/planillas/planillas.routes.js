import { Router } from "express";
import * as planillasController from "./planillas.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.listarPlanillasController,
);

// El colaborador se obtiene de la sesión y el restaurante del gerente se valida en el servicio.
router.get(
  "/mis-detalles/:periodoId",
  permitirRoles("COLABORADOR"),
  planillasController.listarMisDetallesPlanillaController,
);

router.get(
  ["/restaurante", "/restaurante/:periodoId"],
  permitirRoles("GERENTE"),
  planillasController.listarDetallesRestauranteController,
);

router.get(
  "/detalles/:detalleId/conceptos",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.obtenerConceptosPlanillaController,
);

router.get(
  "/periodos/:periodoId/preplanilla",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.calcularPreplanillaController,
);

router.get(
  [
    "/periodos/:periodoId/detalles",
    "/periodos/:periodoId/restaurantes/:restauranteId",
  ],
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.obtenerPlanillasConDetallesRestauranteController,
);

router.post(
  "/periodos/:periodoId/pagar",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.registrarPagoPlanillaController,
);

// Se coloca al final para que los nombres de las rutas anteriores no se tomen como un ID.
router.get(
  "/:planillaId",
  permitirRoles("RECURSOS_HUMANOS", "ADMINISTRADOR"),
  planillasController.obtenerPlanillaController,
);

export default router;