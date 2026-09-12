import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { soloAdministrador } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", authController.loginUserController);
router.patch("/change-password", authController.changePasswordController);
router.post("/register", soloAdministrador, authController.registerUserController);
router.get("/users", authController.getUsersController);
router.get("/users/:id", authController.getUserController);

export default router;
