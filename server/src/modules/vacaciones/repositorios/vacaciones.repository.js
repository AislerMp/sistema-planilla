import { createRequest, sql } from "../../../shared/config/database.js";
import {
  crearCabeceraSolicitud,
} from "../../solicitudes/solicitudes.repository.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function createVacaciones(datos, transaction) {
  const solicitudId = await crearCabeceraSolicitud(
    datos,
    "VACACIONES",
    transaction,
  );

  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("fechaInicio", sql.Date, datos.fechaInicio)
    .input("fechaFin", sql.Date, datos.fechaFin)
    .input("diasSolicitados", sql.Int, datos.diasSolicitados).query(`
      INSERT INTO dbo.Vacaciones (SolicitudId, FechaInicio, FechaFin, DiasSolicitados) 
      OUTPUT INSERTED.*
      VALUES (@solicitudId, @fechaInicio, @fechaFin, @diasSolicitados)
    `);

  if (result.rowsAffected[0] !== 1) {
    throw serviceError("No se pudo crear el detalle de la incapacidad", 500);
  }

  return getVacacionSolicitudById(solicitudId, transaction);
}

export async function getVacacionSolicitudById(solicitudId, transaction) {
  const request = await createRequest(transaction);
  const result = await request.input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT 
        s.SolicitudId,
        s.TipoSolicitud,
        s.ColaboradorId,
        s.RestauranteId,
        s.RegistradoPorUsuarioId,
        s.Estado,
        s.Motivo,
        s.RevisadoPorGerenteId,
        s.RevisadoPorRhId,
        s.Observacion,
        c.Nombres,
        c.Apellidos,
        r.Nombre AS Restaurante,

        v.FechaInicio,
        v.FechaFin, 
        v.DiasSolicitados

      FROM dbo.Solicitudes AS s
       
      INNER JOIN dbo.Vacaciones AS v
        ON v.SolicitudId = s.SolicitudId

      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId
      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = s.RestauranteId

      WHERE s.SolicitudId = @solicitudId
        AND s.TipoSolicitud = 'VACACIONES';
    `);

  return result.recordset[0] ?? null;
}

export async function getVacacionesByColaborador(
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
      SELECT 
        s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion, 
        v.FechaInicio, v.FechaFin, v.DiasSolicitados

      FROM dbo.Vacaciones AS v
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = v.SolicitudId

      WHERE s.TipoSolicitud = 'VACACIONES' AND s.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR v.FechaFin >= @desde)
        AND (@hasta IS NULL OR v.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)

      ORDER BY v.FechaInicio DESC, s.SolicitudId DESC;
    `);

  return result.recordset;
}

export async function getVacacionesByRestaurante(
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
      SELECT 
        s.SolicitudId, s.TipoSolicitud, s.ColaboradorId, s.RestauranteId,
        s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion, 
        v.FechaInicio, v.FechaFin, v.DiasSolicitados

      FROM dbo.Vacaciones AS v
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = v.SolicitudId

      WHERE s.TipoSolicitud = 'VACACIONES'
        AND (@restauranteId IS NULL OR s.RestauranteId = @restauranteId)
        AND (@desde IS NULL OR v.FechaFin >= @desde)
        AND (@hasta IS NULL OR v.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)

      ORDER BY v.FechaInicio DESC, s.SolicitudId DESC;  
    `);

  return result.recordset;
}

export async function getVacacionesSuperpuestas(
  colaboradorId,
  fechaInicio,
  fechaFin,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fechaInicio", sql.Date, fechaInicio)
    .input("fechaFin", sql.Date, fechaFin).query(`
      SELECT
        s.SolicitudId,
        s.Estado,
        v.FechaInicio,
        v.FechaFin,
        v.DiasSolicitados
      FROM dbo.Vacaciones AS v

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = v.SolicitudId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'VACACIONES'
        AND s.Estado IN ('PENDIENTE', 'EN_REVISION_RH', 'APROBADA')
        AND v.FechaInicio <= @fechaFin
        AND v.FechaFin >= @fechaInicio

      ORDER BY v.FechaInicio, s.SolicitudId;  
    `);

  return result.recordset;
}

export async function getVacacionVigenteByFecha(
  colaboradorId,
  fechaAsignada,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fechaAsignada", sql.Date, fechaAsignada).query(`
      SELECT TOP (1)
        s.SolicitudId,
        s.ColaboradorId,
        s.RestauranteId,
        s.Estado,
        v.DiasSolicitados,
        v.FechaInicio,
        v.FechaFin

      FROM dbo.Vacaciones AS v

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = v.SolicitudId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'VACACIONES'
        AND @fechaAsignada BETWEEN v.FechaInicio AND v.FechaFin
        AND s.Estado = 'APROBADA'
      ORDER BY v.FechaInicio DESC, s.SolicitudId DESC;  
    `);

  return result.recordset[0] ?? null;
}
