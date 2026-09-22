import {
  obtenerAsistencia,
  obtenerAsistenciaPorColaboradorYfecha,
  listarAsistenciasPorColaborador,
  listarAsistenciasPorRestaurante,
  ajustarMinutosAsistencia,
} from "./asistenciasDiarias.service.js";

// Al conectar esta consulta a una ruta, verificar el acceso al registro.
export async function obtenerAsistenciaController(req, res) {
  const asistencia = await obtenerAsistencia(req.params.id);
  return res.status(200).json(asistencia);
}

export async function listarAsistenciasPorColaboradorController(req, res) {
  const asistencias = await listarAsistenciasPorColaborador(
    req.user?.ColaboradorId,
    {
      desde: req.query?.desde,
      hasta: req.query?.hasta,
      periodoId: req.query?.periodoId,
    },
  );
  return res.status(200).json(asistencias);
}

export async function listarAsistenciasPorRestauranteController(req, res) {
  const asistencias = await listarAsistenciasPorRestaurante(
    req.user,
    req.query?.restauranteId,
    {
      desde: req.query?.desde,
      hasta: req.query?.hasta,
      periodoId: req.query?.periodoId,
    },
  );
  return res.status(200).json(asistencias);
}

export async function ajustarMinutosAsistenciaController(req, res) {
  const { minutos, motivo } = req.body ?? {};
  const asistencia = await ajustarMinutosAsistencia(
    req.params.id,
    minutos,
    motivo,
    req.user,
  );
  return res.status(200).json({
    message: "Minutos de asistencia ajustados correctamente.",
    asistencia,
  });
}