import { Router } from "express";

import {
  actualizarHorasExtraController,
  obtenerSolicitudController,
  listarMisSolicitudesController,
  listarSolicitudesRestauranteController,
  crearSolicitudController,
  resolverSolicitudController,
} from "./horasExtras.controller.js";

import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

// El ID corresponde a la asistencia, no a una solicitud de horas extras.
router.patch(
  "/asistencias/:id/minutos",
  permitirRoles("GERENTE"),
  actualizarHorasExtraController,
);


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
  permitirRoles("GERENTE"),
  resolverSolicitudController,
);

export default router;
