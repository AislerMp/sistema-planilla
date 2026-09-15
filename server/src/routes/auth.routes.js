import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { soloAdministrador } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", authController.loginUserController);
router.patch("/change-password", authController.changePasswordController);
router.post("/register", soloAdministrador, authController.registerUserController);
router.get("/users", authController.getUsersController);
router.post(
  "/users/activate/:id",
  soloAdministrador,
  authController.activarUsuarioController,
);
router.delete(
  "/users/:id",
  soloAdministrador,
  authController.desactivarUsuarioController,
);
router.get("/users/:id", authController.getUserController);
router.put("/users/:id", soloAdministrador, authController.updateUserController);
router.get("/me", authController.getCurrentUserController);
router.post("/logout", authController.logoutController);
export default router;
