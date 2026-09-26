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
        MinutosDetectados
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
        INSERTED.MinutosDetectados
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
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("asistenciaId", sql.Int, asistenciaId)
    .input("minutosDetectados", sql.Int, minutosDetectados).query(`
      UPDATE dbo.HorasExtras
      SET MinutosDetectados = @minutosDetectados
      OUTPUT
        INSERTED.HoraExtraId,
        INSERTED.AsistenciaId,
        INSERTED.MinutosDetectados
      WHERE AsistenciaId = @asistenciaId;
    `);
  return result.recordset[0] ?? null;
}

/* Para las entidades de SolicitudesHorasExtras */

export async function getSolicitudById(solicitudId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT
        SolicitudHoraExtraId,
        ColaboradorId,
        RestauranteId,
        FechaSolicitada,
        MinutosSolicitados,
        Motivo,
        Estado,
        MinutosAutorizados,
        RevisadoPorUsuarioId,
        Observacion
      FROM dbo.SolicitudesHorasExtras
      WHERE SolicitudHoraExtraId = @solicitudId;
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
    .input("estado", sql.VarChar(15), estado ?? null)
    .query(`
      SELECT
        SolicitudHoraExtraId,
        ColaboradorId,
        RestauranteId,
        FechaSolicitada,
        MinutosSolicitados,
        Motivo,
        Estado,
        MinutosAutorizados,
        RevisadoPorUsuarioId,
        Observacion
      FROM dbo.SolicitudesHorasExtras
      WHERE ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR Estado = @estado)
      ORDER BY FechaSolicitada DESC, SolicitudHoraExtraId DESC;
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
    .input("estado", sql.VarChar(15), estado ?? null)
    .query(`
      SELECT
        s.SolicitudHoraExtraId,
        s.ColaboradorId,
        s.RestauranteId,
        s.FechaSolicitada,
        s.MinutosSolicitados,
        s.Motivo,
        s.Estado,
        s.MinutosAutorizados,
        s.RevisadoPorUsuarioId,
        s.Observacion,
        c.Nombres,
        c.Apellidos
      FROM dbo.SolicitudesHorasExtras AS s
      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId
      WHERE s.RestauranteId = @restauranteId
        AND (@desde IS NULL OR s.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR s.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY s.FechaSolicitada DESC, s.SolicitudHoraExtraId DESC;
    `);
  return result.recordset;
}

export async function createSolicitud(datos, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("fechaSolicitada", sql.Date, datos.fechaSolicitada)
    .input("minutosSolicitados", sql.Int, datos.minutosSolicitados)
    .input("motivo", sql.NVarChar(500), datos.motivo)
    .query(`
      INSERT INTO dbo.SolicitudesHorasExtras (
        ColaboradorId,
        RestauranteId,
        FechaSolicitada,
        MinutosSolicitados,
        Motivo
      )
      OUTPUT
        INSERTED.SolicitudHoraExtraId,
        INSERTED.ColaboradorId,
        INSERTED.RestauranteId,
        INSERTED.FechaSolicitada,
        INSERTED.MinutosSolicitados,
        INSERTED.Motivo,
        INSERTED.Estado,
        INSERTED.MinutosAutorizados,
        INSERTED.RevisadoPorUsuarioId,
        INSERTED.Observacion
      VALUES (
        @colaboradorId,
        @restauranteId,
        @fechaSolicitada,
        @minutosSolicitados,
        @motivo
      );
    `);
  return result.recordset[0] ?? null;
}

export async function resolverSolicitud(
  solicitudId,
  datosRevision,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("estado", sql.VarChar(15), datosRevision.estado)
    .input("minutosAutorizados", sql.Int, datosRevision.minutosAutorizados)
    .input("revisadoPorUsuarioId", sql.Int, datosRevision.revisadoPorUsuarioId)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .query(`
      UPDATE dbo.SolicitudesHorasExtras
      SET Estado = @estado,
          MinutosAutorizados = @minutosAutorizados,
          RevisadoPorUsuarioId = @revisadoPorUsuarioId,
          Observacion = @observacion
      OUTPUT
        INSERTED.SolicitudHoraExtraId,
        INSERTED.ColaboradorId,
        INSERTED.RestauranteId,
        INSERTED.FechaSolicitada,
        INSERTED.MinutosSolicitados,
        INSERTED.Motivo,
        INSERTED.Estado,
        INSERTED.MinutosAutorizados,
        INSERTED.RevisadoPorUsuarioId,
        INSERTED.Observacion
      WHERE SolicitudHoraExtraId = @solicitudId
        AND Estado = 'PENDIENTE';
    `);
  return result.recordset[0] ?? null;
}
