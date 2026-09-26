import {
  listarPeriodos,
  obtenerPeriodo,
  obtenerPeriodoPorFecha,
  obtenerPeriodoActual,
  crearPeriodo,
  cambiarEstadoPeriodo,
} from "./periodosPlanillas.service.js";

export async function listarPeriodosController(req, res) {
  const periodos = await listarPeriodos();
  return res.status(200).json(periodos);
}

export async function obtenerPeriodoController(req, res) {
  const periodo = await obtenerPeriodo(req.params.id);
  return res.status(200).json(periodo);
}

export async function obtenerPeriodoPorFechaController(req, res) {
  const periodo = await obtenerPeriodoPorFecha(req.query?.fechaAsignada);
  return res.status(200).json(periodo);
}

export async function obtenerPeriodoActualController(req, res) {
  const periodo = await obtenerPeriodoActual();
  return res.status(200).json(periodo);
}

export async function crearPeriodoController(req, res) {
  const periodo = await crearPeriodo(req.body ?? {}, req.user?.UsuarioId);
  return res.status(201).json({
    message: "Período de planilla creado correctamente.",
    periodo,
  });
}

export async function cambiarEstadoPeriodoController(req, res) {
  const nuevoEstado = req.body?.estado;
  const periodo = await cambiarEstadoPeriodo(
    req.params.id,
    nuevoEstado,
    req.user?.UsuarioId,
  );
  return res.status(200).json({
    message: "Estado del período actualizado correctamente.",
    periodo,
  });
}
