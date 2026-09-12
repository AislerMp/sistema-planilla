import { Router } from "express";
import * as rolesController from "../controllers/rolesController.js";

const router = Router();

router.get("/", rolesController.getRolesController);
router.get("/:id", rolesController.getRolController);

export default router;
