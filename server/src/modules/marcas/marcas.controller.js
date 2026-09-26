import * as marcasServices from "./marcas.service.js";

export async function getMisMarcasController(req, res) {
  const marcas = await marcasServices.consultarMisMarcas(
    req.user,
    req.query.fechaAsignada,
  );
  return res.status(200).json(marcas);
}

export async function getMarcasColaboradorByGerente(req, res) {
  const marcas = await marcasServices.consultarMarcasColaborador(
    req.user,
    req.params.id,
    req.query.fechaAsignada,
  );
  return res.status(200).json(marcas);
}

export async function registrarEntradaController(req, res) {
  const marcaCreada = await marcasServices.registrarEntrada(req.user);
  return res.status(201).json(marcaCreada);
}

export async function registrarSalidaController(req, res) {
  const marcaCreada = await marcasServices.registrarSalida(req.user);
  return res.status(201).json(marcaCreada);
}
