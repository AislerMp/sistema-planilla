import { createRequest, sql } from "../../shared/config/database.js";

import { crearCabeceraSolicitud } from "../solicitudes/solicitudes.repository.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

export async function rechazarSolicitudesVencidas(
  fechaHoy,
  { colaboradorId = null, restauranteId = null, solicitudId = null },
) {
  const request = await createRequest();
  await request
    .input("fechaHoy", sql.Date, fechaHoy)
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("restauranteId", sql.Int, restauranteId)
    .input("solicitudId", sql.Int, solicitudId).query(`
      UPDATE s
      SET Estado = 'RECHAZADA', RevisadoPorGerenteId = NULL, RevisadoPorRhId = NULL,
          Observacion = N'Rechazada automáticamente por vencimiento'
      FROM dbo.Solicitudes AS s
      INNER JOIN dbo.PermisosLaborales AS d ON d.SolicitudId = s.SolicitudId
      WHERE s.TipoSolicitud = 'PERMISO_LABORAL' AND s.Estado = 'PENDIENTE'
        AND d.FechaSolicitada < @fechaHoy
        AND (@colaboradorId IS NULL OR s.ColaboradorId = @colaboradorId)
        AND (@restauranteId IS NULL OR s.RestauranteId = @restauranteId)
        AND (@solicitudId IS NULL OR s.SolicitudId = @solicitudId);
    `);
}

export async function getPermisosById(solicitudId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion, d.FechaSolicitada
      FROM dbo.PermisosLaborales AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'PERMISO_LABORAL';
    `);
    
  return result.recordset[0] ?? null;
}

// Al crear, el servicio ya mantiene el bloqueo del colaborador.
export async function getPermisoByColaboradorYFecha(
  colaboradorId,
  fecha,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fecha", sql.Date, fecha).query(`
      SELECT TOP (1) s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion, d.FechaSolicitada
      FROM dbo.PermisosLaborales AS d WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN dbo.Solicitudes AS s WITH (UPDLOCK, HOLDLOCK) ON s.SolicitudId = d.SolicitudId
      WHERE s.TipoSolicitud = 'PERMISO_LABORAL' AND s.ColaboradorId = @colaboradorId
        AND d.FechaSolicitada = @fecha;
    `);
  return result.recordset[0] ?? null;
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
    .input("estado", sql.VarChar(20), estado ?? null).query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, c.Nombres, c.Apellidos
      FROM dbo.PermisosLaborales AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      INNER JOIN dbo.Colaboradores AS c ON c.ColaboradorId = s.ColaboradorId
      WHERE s.TipoSolicitud = 'PERMISO_LABORAL' AND s.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR d.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR d.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY d.FechaSolicitada DESC, s.SolicitudId DESC;
    `);
  return result.recordset;
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
    .input("estado", sql.VarChar(20), estado ?? null).query(`
      SELECT s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        d.FechaSolicitada, c.Nombres, c.Apellidos
      FROM dbo.PermisosLaborales AS d
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = d.SolicitudId
      INNER JOIN dbo.Colaboradores AS c ON c.ColaboradorId = s.ColaboradorId
      WHERE s.TipoSolicitud = 'PERMISO_LABORAL'
        AND (@restauranteId IS NULL OR s.RestauranteId = @restauranteId)
        AND (@desde IS NULL OR d.FechaSolicitada >= @desde)
        AND (@hasta IS NULL OR d.FechaSolicitada <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY d.FechaSolicitada DESC, s.SolicitudId DESC;
    `);
  return result.recordset;
}

export async function createPermiso(datos, transaction) {
  const solicitudId = await crearCabeceraSolicitud(
    datos,
    "PERMISO_LABORAL",
    transaction,
  );
  
  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("fechaSolicitada", sql.Date, datos.fechaSolicitada).query(`
      INSERT INTO dbo.PermisosLaborales (SolicitudId, FechaSolicitada)
      VALUES (@solicitudId, @fechaSolicitada);
    `);
  if (result.rowsAffected[0] !== 1)
    throw serviceError("No se pudo crear el detalle de la solicitud", 500);
  return getPermisosById(solicitudId, transaction);
}

export async function resolverPermiso(solicitudId, datosRevision, transaction) {
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
      INNER JOIN dbo.PermisosLaborales AS d ON d.SolicitudId = s.SolicitudId
      WHERE s.SolicitudId = @solicitudId AND s.TipoSolicitud = 'PERMISO_LABORAL'
        AND s.Estado = 'PENDIENTE';
    `);

  if (!result.recordset[0]) return null;
  
  return getPermisosById(solicitudId, transaction);
}
