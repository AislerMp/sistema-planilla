import { Router } from "express";
import * as puestosController from "../controllers/puestosController.js";
import { soloAdministrador } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", puestosController.getPuestosController);
router.get("/:id", puestosController.getPuestoController);
router.post("/", soloAdministrador, puestosController.createPuestoController);
router.patch("/:id/tarifa", soloAdministrador, puestosController.updateTarifaPuestoController);
router.post("/activate/:id", soloAdministrador, puestosController.activarPuestoController);
router.delete("/:id", soloAdministrador, puestosController.desactivarPuestoController);

export default router;
