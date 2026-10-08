import { crearCabeceraSolicitud } from "../solicitudes/solicitudes.repository.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";
import { beginTransaction } from "../../shared/config/database.js";
import { createRequest, sql } from "../../shared/config/database.js";

/* Para las entidades de Horas extras */

export async function getHorasExtrasByAsistencia(
  asistenciaId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request.input("asistenciaId", sql.Int, asistenciaId)
    .query(`
      SELECT
        HoraExtraId,
        AsistenciaId,
        MinutosDetectados,
        MinutosAjustados
      FROM dbo.HorasExtras
      WHERE AsistenciaId = @asistenciaId;
    `);
  return result.recordset[0] ?? null;
}

export async function createHorasExtras(datos, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("asistenciaId", sql.Int, datos.asistenciaId)
    .input("minutosDetectados", sql.Int, datos.minutosDetectados).query(`
      INSERT INTO dbo.HorasExtras (
        AsistenciaId,
        MinutosDetectados
      )
      OUTPUT
        INSERTED.HoraExtraId,
        INSERTED.AsistenciaId,
        INSERTED.MinutosDetectados,
        INSERTED.MinutosAjustados
      VALUES (
        @asistenciaId,
        @minutosDetectados
      );
    `);
  return result.recordset[0] ?? null;
}

export async function updateMinutosExtras(
  asistenciaId,
  minutosDetectados,
  transaction = null,
  restablecerAjuste = false,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("asistenciaId", sql.Int, asistenciaId)
    .input("minutosDetectados", sql.Int, minutosDetectados)
    .input("restablecerAjuste", sql.Bit, restablecerAjuste).query(`
      UPDATE dbo.HorasExtras
      SET MinutosDetectados = @minutosDetectados,
          MinutosAjustados = CASE WHEN @restablecerAjuste = 1 THEN NULL ELSE MinutosAjustados END
      OUTPUT
        INSERTED.HoraExtraId,
        INSERTED.AsistenciaId,
        INSERTED.MinutosDetectados,
        INSERTED.MinutosAjustados
      WHERE AsistenciaId = @asistenciaId;
    `);
  return result.recordset[0] ?? null;
}

export async function updateMinutosExtrasAjustados(
  asistenciaId,
  minutosAjustados,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("asistenciaId", sql.Int, asistenciaId)
    .input("minutosAjustados", sql.Int, minutosAjustados).query(`
      UPDATE dbo.HorasExtras
      SET MinutosAjustados = @minutosAjustados
      OUTPUT
        INSERTED.HoraExtraId,
        INSERTED.AsistenciaId,
        INSERTED.MinutosDetectados,
        INSERTED.MinutosAjustados
      WHERE AsistenciaId = @asistenciaId;
    `);

  return result.recordset[0] ?? null;
}

/* Para las solicitudes de horas extras. */

export async function rechazarSolicitudesVencidas(
  fechaHoy,
  { colaboradorId = null, restauranteId = null, solicitudId = null },
) {
  const transaction = await beginTransaction();
  try {
    const request = await createRequest(transaction);
    await request
      .input("fechaHoy", sql.Date, fechaHoy)
      .input("colaboradorId", sql.Int, colaboradorId)
      .input("restauranteId", sql.Int, restauranteId)
      .input("solicitudId", sql.Int, solicitudId).query(`
      DECLARE @Vencidas TABLE (SolicitudId INT PRIMARY KEY);
      UPDATE s
      SET Estado = 'RECHAZADA', RevisadoPorGerenteId = NULL, RevisadoPorRhId = NULL,
          Observacion = N'Rechazada automáticamente por vencimiento'
      OUTPUT INSERTED.SolicitudId INTO @Vencidas
      FROM dbo.Solicitudes AS s
      INNER JOIN dbo.SolicitudesHorasExtras AS d ON d.SolicitudId = s.SolicitudId
      WHERE s.TipoSolicitud = 'HORAS_EXTRAS' AND s.Estado = 'PENDIENTE'
        AND d.FechaSolicitada < @fechaHoy
        AND (@colaboradorId IS NULL OR s.ColaboradorId = @colaboradorId)
        AND (@restauranteId IS NULL OR s.RestauranteId = @restauranteId)
        AND (@solicitudId IS NULL OR s.SolicitudId = @solicitudId);
      UPDATE d SET MinutosAutorizados = 0
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN @Vencidas AS v ON v.SolicitudId = d.SolicitudId;
    `);
    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir el rechazo de extras vencidas",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function getSolicitudById(solicitudId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, d.MinutosSolicitados, d.MinutosAutorizados
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'HORAS_EXTRAS';
    `);
  return result.recordset[0] ?? null;
}

// Al crear, el servicio ya mantiene el bloqueo del colaborador.
export async function obtenerSolicitudesByFechaAndID(
  fecha,
  colaboradorId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fecha", sql.Date, fecha).query(`
      SELECT TOP (1) s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, d.MinutosSolicitados, d.MinutosAutorizados
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      WHERE s.TipoSolicitud = 'HORAS_EXTRAS' AND s.ColaboradorId = @colaboradorId
        AND d.FechaSolicitada = @fecha;
    `);
  return result.recordset[0] ?? null;
}

export async function getSolicitudesByColaborador(
  colaboradorId,
  filtros = {},
  transaction = null,
) {
  const { desde, hasta, estado } = filtros;
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("desde", sql.Date, desde ?? null)
    .input("hasta", sql.Date, hasta ?? null)
    .input("estado", sql.VarChar(20), estado ?? null).query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, d.MinutosSolicitados, d.MinutosAutorizados,
        c.Nombres, c.Apellidos
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      INNER JOIN dbo.Colaboradores AS c ON c.ColaboradorId = s.ColaboradorId
      WHERE s.TipoSolicitud = 'HORAS_EXTRAS' AND s.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR d.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR d.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY d.FechaSolicitada DESC, s.SolicitudId DESC;
    `);
  return result.recordset;
}

export async function getSolicitudesByRestaurante(
  restauranteId,
  filtros = {},
  transaction = null,
) {
  const { desde, hasta, estado } = filtros;
  const request = await createRequest(transaction);
  const result = await request
    .input("restauranteId", sql.Int, restauranteId)
    .input("desde", sql.Date, desde ?? null)
    .input("hasta", sql.Date, hasta ?? null)
    .input("estado", sql.VarChar(20), estado ?? null).query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, d.MinutosSolicitados, d.MinutosAutorizados,
        c.Nombres, c.Apellidos
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      INNER JOIN dbo.Colaboradores AS c ON c.ColaboradorId = s.ColaboradorId
      WHERE s.TipoSolicitud = 'HORAS_EXTRAS' AND s.RestauranteId = @restauranteId
        AND (@desde IS NULL OR d.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR d.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY d.FechaSolicitada DESC, s.SolicitudId DESC;
    `);
  return result.recordset;
}

export async function createSolicitud(datos, transaction) {
  
  const solicitudId = await crearCabeceraSolicitud(
    datos,
    "HORAS_EXTRAS",
    transaction,
  );

  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("fechaSolicitada", sql.Date, datos.fechaSolicitada)
    .input("minutosSolicitados", sql.Int, datos.minutosSolicitados).query(`
      INSERT INTO dbo.SolicitudesHorasExtras (SolicitudId, FechaSolicitada, MinutosSolicitados)
      SELECT s.SolicitudId, @fechaSolicitada, @minutosSolicitados
      FROM dbo.Solicitudes AS s
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'HORAS_EXTRAS';
    `);
  if (result.rowsAffected[0] !== 1)
    throw serviceError("No se pudo crear el detalle de la solicitud", 500);
  return getSolicitudById(solicitudId, transaction);
}

export async function resolverSolicitud(
  solicitudId,
  datosRevision,
  transaction,
) {
  if (!transaction)
    throw serviceError(
      "Se requiere una transacción para resolver solicitudes",
      500,
    );

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("revisadoPorGerenteId", sql.Int, datosRevision.revisadoPorGerenteId)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .query(`
      UPDATE s
      SET Estado = @estado, RevisadoPorGerenteId = @revisadoPorGerenteId,
          RevisadoPorRhId = NULL, Observacion = @observacion
      OUTPUT INSERTED.SolicitudId
      FROM dbo.Solicitudes AS s
      INNER JOIN dbo.SolicitudesHorasExtras AS d ON d.SolicitudId = s.SolicitudId
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'HORAS_EXTRAS'
        AND s.Estado = 'PENDIENTE';
    `);

  if (!result.recordset[0]) return null;

  const detalleRequest = await createRequest(transaction);
  const detalle = await detalleRequest
    .input("solicitudId", sql.Int, solicitudId)
    .input("minutosAutorizados", sql.Int, datosRevision.minutosAutorizados)
    .query(`
      UPDATE d SET MinutosAutorizados = @minutosAutorizados
      FROM dbo.SolicitudesHorasExtras AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'HORAS_EXTRAS';
    `);

  if (detalle.rowsAffected[0] !== 1)
    throw serviceError("No se pudo actualizar el detalle de extras", 500);
  
  return getSolicitudById(solicitudId, transaction);
}
