import { createRequest, sql } from "../../shared/config/database.js";

export async function rechazarSolicitudesVencidas(
  fechaHoy,
  { colaboradorId = null, restauranteId = null, permisoId = null },
) {
  const request = await createRequest();
  await request
    .input("fechaHoy", sql.Date, fechaHoy)
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("restauranteId", sql.Int, restauranteId)
    .input("permisoId", sql.Int, permisoId).query(`
      UPDATE dbo.PermisosLaborales
      SET Estado = 'RECHAZADA',
          RevisadoPorUsuarioId = NULL,
          Observacion = N'Rechazada automáticamente por vencimiento'
      WHERE Estado = 'PENDIENTE' AND FechaSolicitada < @fechaHoy
        AND (@colaboradorId IS NULL OR ColaboradorId = @colaboradorId)
        AND (@restauranteId IS NULL OR RestauranteId = @restauranteId)
        AND (@permisoId IS NULL OR PermisoId = @permisoId);
    `);
}

export async function getPermisosById(permisosId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("permisosId", sql.Int, permisosId).query(`
    SELECT
        PermisoId,
        ColaboradorId,
        RestauranteId,
        FechaSolicitada,
        Motivo,
        Estado,
        RevisadoPorUsuarioId,
        Observacion
    FROM dbo.PermisosLaborales
    WHERE PermisoId = @permisosId
  `);

  return result.recordset[0] || null;
}

export async function getPermisoByColaboradorYFecha(
  colaboradorId,
  fecha,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fecha", sql.Date, fecha).query(`
            SELECT TOP (1) *
            FROM dbo.PermisosLaborales WITH (UPDLOCK, HOLDLOCK)
            WHERE ColaboradorId = @colaboradorId AND FechaSolicitada = @fecha;
        `);
  return result.recordset[0] || null;
}

export async function getPermisosByColaborador(
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
    .input("estado", sql.VarChar(15), estado ?? null).query(`
      SELECT 
        p.PermisoId,
        p.ColaboradorId,
        p.RestauranteId,
        p.FechaSolicitada,
        p.Motivo,
        p.Estado,
        p.RevisadoPorUsuarioId,
        p.Observacion,
        c.Nombres,
        c.Apellidos
      FROM dbo.PermisosLaborales p
      JOIN dbo.Colaboradores c 
        ON p.ColaboradorId = c.ColaboradorId
      WHERE p.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR p.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR p.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR p.Estado = @estado)
        ORDER BY p.FechaSolicitada DESC
    `);

  return result.recordset || [];
}

export async function getPermisosByRestaurante(
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
    .input("estado", sql.VarChar(15), estado ?? null).query(`
      SELECT
        p.PermisoId,
        p.ColaboradorId,
        p.RestauranteId,
        p.FechaSolicitada,
        p.Motivo,
        p.Estado,
        p.RevisadoPorUsuarioId,
        p.Observacion,
        c.Nombres,
        c.Apellidos
      FROM dbo.PermisosLaborales AS p
      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = p.ColaboradorId
      WHERE p.RestauranteId = @restauranteId
        AND (@desde IS NULL OR p.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR p.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR p.Estado = @estado)
      ORDER BY p.FechaSolicitada DESC, p.PermisoId DESC;
    `);
  return result.recordset;
}

// datos: { colaboradorId, restauranteId, fechaSolicitada, motivo }
// Devuelve el registro creado.
export async function createPermiso(datos, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("fechaSolicitada", sql.Date, datos.fechaSolicitada)
    .input("motivo", sql.VarChar(255), datos.motivo).query(`
        INSERT INTO dbo.PermisosLaborales (ColaboradorId, RestauranteId, FechaSolicitada, Motivo)
        OUTPUT INSERTED.*
        VALUES (@colaboradorId, @restauranteId, @fechaSolicitada, @motivo);
      `);

  return result.recordset[0] || null;
}

// datosRevision: { estado, revisadoPorUsuarioId, observacion }
// Devuelve el registro actualizado o null.
export async function resolverPermiso(
  permisoId,
  datosRevision,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("permisoId", sql.Int, permisoId)
    .input("estado", sql.VarChar(15), datosRevision.estado)
    .input("revisadoPorUsuarioId", sql.Int, datosRevision.revisadoPorUsuarioId)
    .input("observacion", sql.VarChar(500), datosRevision.observacion ?? null)
    .query(`
        UPDATE dbo.PermisosLaborales
        SET Estado = @estado,
            RevisadoPorUsuarioId = @revisadoPorUsuarioId,
            Observacion = @observacion
        OUTPUT INSERTED.*
        WHERE PermisoId = @permisoId AND Estado = 'PENDIENTE'
      `);
  return result.recordset[0] || null;
}
