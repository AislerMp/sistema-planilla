import { Router } from "express";
import * as restaurantesController from "./restaurantes.controller.js";
import { soloAdministrador } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get("/", restaurantesController.getRestaurantesController);
router.get("/:id", restaurantesController.getRestauranteController);
router.post("/", soloAdministrador, restaurantesController.createRestauranteController);
router.put("/:id", soloAdministrador, restaurantesController.updateRestauranteController);
router.post("/activate/:id", soloAdministrador, restaurantesController.activarRestauranteController);
router.delete("/:id", soloAdministrador, restaurantesController.desactivarRestauranteController);

export default router;
