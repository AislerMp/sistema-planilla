import { Router } from "express";
import * as rolesController from "./roles.controller.js";

const router = Router();

router.get("/", rolesController.getRolesController);
router.get("/:id", rolesController.getRolController);

export default router;
