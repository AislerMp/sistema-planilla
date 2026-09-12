import { Router } from "express";
import * as colaboradorController from "../controllers/colaboradoresController.js";
import { soloAdministrador } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", colaboradorController.getColaboradoresController);

router.post("/activate/:id", soloAdministrador, colaboradorController.activarColaboradorController);

router.get("/:id", colaboradorController.getColaboradorByIdController);

router.post("/", soloAdministrador, colaboradorController.createColaboradorController);

router.put("/:id", soloAdministrador, colaboradorController.updateColaboradorController);

router.delete("/:id", soloAdministrador, colaboradorController.desactivarColaboradorController);

export default router;
