import { Router } from "express";
import * as periodosController from "./periodosPlanillas.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.use(permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS"));

router.get("/", periodosController.listarPeriodosController);

// Las rutas fijas van antes de /:id para que no se interpreten como un ID.
router.get("/actual", periodosController.obtenerPeriodoActualController);

router.get("/por-fecha", periodosController.obtenerPeriodoPorFechaController);

router.get("/:id", periodosController.obtenerPeriodoController);

router.post("/", periodosController.crearPeriodoController);

router.patch("/:id/estado", periodosController.cambiarEstadoPeriodoController);

export default router;
