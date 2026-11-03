import {
  listarAguinaldos,
  obtenerAguinaldo,
  listarDetallesAguinaldo,
  calcularAguinaldo,
  confirmarAguinaldo,
} from "./aguinaldo.service.js";

// GET /api/aguinaldos
export async function listarAguinaldosController(req, res) {
  const aguinaldos = await listarAguinaldos();

  return res.status(200).json(aguinaldos);
}

// GET /api/aguinaldos/:aguinaldoId
export async function obtenerAguinaldoController(req, res) {
  const aguinaldo = await obtenerAguinaldo(req.params.aguinaldoId);

  return res.status(200).json(aguinaldo);
}

// GET /api/aguinaldos/detalles
export async function listarDetallesAguinaldoController(req, res) {
  const detalles = await listarDetallesAguinaldo(req.user, req.query ?? {});

  return res.status(200).json(detalles);
}

// GET /api/aguinaldos/anios/:anio/calculo
export async function calcularAguinaldoController(req, res) {
  const calculo = await calcularAguinaldo(
    req.params.anio,
    req.user,
    req.query ?? {},
  );

  return res.status(200).json(calculo);
}

// POST /api/aguinaldos/anios/:anio/confirmar
export async function confirmarAguinaldoController(req, res) {
  const resultado = await confirmarAguinaldo(req.params.anio, req.user);

  return res.status(201).json({
    message: "Aguinaldo confirmado correctamente.",
    resultado,
  });
}
