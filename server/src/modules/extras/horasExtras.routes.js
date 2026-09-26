import { Router } from "express";

import {
  obtenerSolicitudController,
  listarMisSolicitudesController,
  listarSolicitudesRestauranteController,
  crearSolicitudController,
  resolverSolicitudController,
} from "./horasExtras.controller.js";

import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

// Las rutas específicas van antes de /solicitudes/:id.
router.get(
  "/solicitudes/mis-solicitudes",
  permitirRoles("COLABORADOR"),
  listarMisSolicitudesController,
);

router.get(
  "/solicitudes/restaurante",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  listarSolicitudesRestauranteController,
);

router.get(
  "/solicitudes/:id",
  permitirRoles("COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  obtenerSolicitudController,
);

router.post(
  "/solicitudes",
  permitirRoles("COLABORADOR"),
  crearSolicitudController,
);

router.patch(
  "/solicitudes/:id/resolver",
  permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"),
  resolverSolicitudController,
);

export default router;
