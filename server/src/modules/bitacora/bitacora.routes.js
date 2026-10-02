import { Router } from "express";
import { listarBitacorasController, obtenerBitacoraController } from "./bitacora.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.use(permitirRoles("ADMINISTRADOR", "RECURSOS_HUMANOS"));
router.get("/", listarBitacorasController);
router.get("/:id", obtenerBitacoraController);

export default router;
