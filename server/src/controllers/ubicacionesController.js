import {
  getProvincias,
  getProvincia,
  getCantones,
  getCanton,
  getDistritos,
  getDistrito,
} from "../services/ubicacionesService.js";

export async function getProvinciasController(req, res) {
  const provincias = await getProvincias();
  return res.status(200).json(provincias);
}

export async function getProvinciaController(req, res) {
  const provincia = await getProvincia(req.params.id);
  return res.status(200).json(provincia);
}

export async function getCantonesController(req, res) {
  // La ruta debe incluir :provinciaId para filtrar los cantones.
  const cantones = await getCantones(req.params.provinciaId);
  return res.status(200).json(cantones);
}

export async function getCantonController(req, res) {
  const canton = await getCanton(req.params.id);
  return res.status(200).json(canton);
}

export async function getDistritosController(req, res) {
  // La ruta debe incluir :cantonId para filtrar los distritos.
  const distritos = await getDistritos(req.params.cantonId);
  return res.status(200).json(distritos);
}

export async function getDistritoController(req, res) {
  const distrito = await getDistrito(req.params.id);
  return res.status(200).json(distrito);
}
