import * as planillasService from "./services/planillas.service.js";
import * as detallesService from "./services/detallesPlanilla.service.js";
import * as conceptosService from "./services/conceptosPlanilla.service.js";

export async function listarPlanillasController(req, res) {
  const planillas = await planillasService.listarPlanillas();
  return res.status(200).json(planillas);
}

export async function obtenerPlanillaController(req, res) {
  const planilla = await planillasService.obtenerPlanilla(req.params.planillaId);
  return res.status(200).json(planilla);
}

export async function calcularPreplanillaController(req, res) {
  const prePlanilla = await planillasService.calcularPreplanilla(
    req.params.periodoId,
    req.user,
  );
  return res.status(200).json(prePlanilla);
}

export async function registrarPagoPlanillaController(req, res) {
  const resultado = await planillasService.registrarPagoPlanilla(
    req.params.periodoId,
    req.user,
  );
  return res.status(200).json(resultado);
}

// Funcion para Recursos Humanos (RH)
export async function obtenerPlanillasConDetallesRestauranteController(
  req,
  res,
) {
  const planillasConDetalles =
    await planillasService.obtenerPlanillasConDetallesRestaurante(
      req.params.restauranteId,
      req.params.periodoId,
    );
  return res.status(200).json(planillasConDetalles);
}

// Funcion para Colaboradores
export async function listarMisDetallesPlanillaController(req, res) {
  const misDetalles = await detallesService.obtenerDetallesColaboradorByPeriodo(
    req.params.periodoId,
    req.user.ColaboradorId
  );
  return res.status(200).json(misDetalles);
}

// Funcion para Gerentes de Restaurante
export async function listarDetallesRestauranteController(req, res) {
  const detalles = await detallesService.obtenerDetallesByRestaurante(
    req.user,
    req.params?.periodoId,
    null
  );
  return res.status(200).json(detalles);
}

export async function obtenerConceptosPlanillaController(req, res){
    const conceptos = await conceptosService.listarConceptosPorDetalle(
      req.params.detalleId,
      req.user,
    );
    return res.status(200).json(conceptos);
}

