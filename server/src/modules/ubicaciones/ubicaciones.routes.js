import { Router } from "express";
import * as ubicacionesController from "./ubicaciones.controller.js";

const router = Router();

router.get("/provincias", ubicacionesController.getProvinciasController);
router.get("/provincias/:id", ubicacionesController.getProvinciaController);
router.get("/provincias/:provinciaId/cantones", ubicacionesController.getCantonesController);
router.get("/cantones/:id", ubicacionesController.getCantonController);
router.get("/cantones/:cantonId/distritos", ubicacionesController.getDistritosController);
router.get("/distritos/:id", ubicacionesController.getDistritoController);

export default router;
