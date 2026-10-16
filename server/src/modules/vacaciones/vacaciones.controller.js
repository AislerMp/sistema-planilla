import * as vacacionesServices from "./services/vacaciones.service.js";
import { obtenerSaldoVacaciones } from "./services/saldosVacaciones.service.js";

export async function getVacacionController(req, res) {
  const vacacion = await vacacionesServices.getVacacionesById(
    req.params.id,
    req.user,
  );
  return res.status(200).json(vacacion);
}

export async function getMisVacacionesController(req, res) {
  const vacaciones = await vacacionesServices.getMisVacaciones(
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
    req.user,
  );
  return res.status(200).json(vacaciones);
}

export async function getVacacionesByRestauranteController(req, res) {
  const vacaciones = await vacacionesServices.getVacacionesByRestaurante(
    req.params.restauranteId ?? req.query.restauranteId,
    {
      desde: req.query.desde,
      hasta: req.query.hasta,
      estado: req.query.estado,
    },
    req.user,
  );
  return res.status(200).json(vacaciones);
}

export async function crearVacacionesController(req, res) {
  const vacacion = await vacacionesServices.solicitarVacaciones(
    req.body ?? {},
    req.user,
  );
  return res.status(201).json(vacacion);
}

export async function revisarVacacionesGerenteController(req, res) {
  const vacacion = await vacacionesServices.revisarVacacionesGerente(
    req.params.id,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(vacacion);
}

export async function resolverVacacionesRhController(req, res) {
  const resultado = await vacacionesServices.resolverVacacionesRH(
    req.params.id,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(resultado);
}

export async function getMiSaldoVacacionesController(req, res) {
  const saldo = await obtenerSaldoVacaciones(req.user.ColaboradorId);
  return res.status(200).json(saldo);
}

export async function revertirVacacionesController(req, res) {
  const vacacion = await vacacionesServices.revertirVacaciones(
    req.params.id,
    req.body ?? {},
    req.user,
  );
  return res.status(200).json(vacacion);
}

export async function getSaldoVacacionesByColaboradorController(req, res) {
  const saldo = await obtenerSaldoVacaciones(req.params.colaboradorId);
  return res.status(200).json(saldo);
}
