import * as liquidacionesService from "./liquidaciones.service.js";

export async function listarLiquidacionesController(req, res) {
  const { restauranteId, desde, hasta, motivoSalida } = req.query;

  const liquidaciones =
    await liquidacionesService.getLiquidacionesByRestauranteService(
      restauranteId ?? null,
      { desde, hasta, motivoSalida },
    );

  return res.status(200).json(liquidaciones);
}

export async function obtenerLiquidacionController(req, res) {
  const liquidacion = await liquidacionesService.getLiquidacionByIdService(
    req.params.liquidacionId,
  );

  return res.status(200).json(liquidacion);
}

export async function obtenerLiquidacionPorColaboradorController(req, res) {
  const liquidacion =
    await liquidacionesService.getLiquidacionByColaboradorService(
      req.params.colaboradorId,
    );

  return res.status(200).json(liquidacion);
}

export async function calcularLiquidacionController(req, res) {
  const liquidacionCalculada = await liquidacionesService.calcularLiquidacion(
    req.user,
    req.params.colaboradorId,
    req.body ?? {},
  );

  return res.status(200).json(liquidacionCalculada);
}

export async function confirmarLiquidacionController(req, res) {
  const liquidacion = await liquidacionesService.confirmarLiquidacion(
    req.params.colaboradorId,
    req.body ?? {},
    req.user,
  );

  return res.status(201).json({
    message: "Liquidación registrada correctamente.",
    liquidacion,
  });
}
