import { Router } from "express";
import * as controller from "./deducciones.controller.js";
import { permitirRoles } from "../../shared/middlewares/auth.middleware.js";

const router = Router();
const rolesConsulta = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
const rolesCatalogo = ["COLABORADOR", "RECURSOS_HUMANOS", "ADMINISTRADOR"];

router.get("/catalogo", permitirRoles(...rolesCatalogo), controller.getDeducciones);
router.get("/catalogo/:deduccionId", permitirRoles(...rolesCatalogo), controller.getDeduccionesById);
router.post("/catalogo", permitirRoles("ADMINISTRADOR"), controller.crearDeduccion);
router.patch("/catalogo/:deduccionId", permitirRoles("ADMINISTRADOR"), controller.actualizarDeduccion);
router.post("/catalogo/:deduccionId/versiones", permitirRoles("ADMINISTRADOR"), controller.crearVersionDeduccion);
router.patch("/catalogo/:deduccionId/vigencia", permitirRoles("ADMINISTRADOR"), controller.finalizarVigenciaDeduccion);

router.get("/mis-solicitudes", permitirRoles("COLABORADOR"), controller.getMisSolicitudes);
router.get(["/restaurante", "/restaurante/:restauranteId"], permitirRoles("GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"), controller.getSolicitudesPorRestaurante);
router.get("/solicitudes/:solicitudId", permitirRoles(...rolesConsulta), controller.getSolicitudById);
router.post("/solicitudes", permitirRoles("COLABORADOR"), controller.solicitarDeduccion);
router.patch("/solicitudes/:solicitudId/resolver-rh", permitirRoles("RECURSOS_HUMANOS"), controller.resolverSolicitudRh);

export default router;
