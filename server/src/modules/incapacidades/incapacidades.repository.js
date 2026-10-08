import { createRequest, sql } from "../../shared/config/database.js";
import { crearCabeceraSolicitud } from "../solicitudes/solicitudes.repository.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

// TIPOS DE INCAPACIDAD REPOSITORY
export async function getTiposIncapacidad() {
  const request = await createRequest();

  const result = await request.query(`
    SELECT TipoIncapacidadId, Codigo, Nombre, EntidadEmisora,
      PorcentajePatronal, Activo
    FROM dbo.TiposIncapacidad
    WHERE Activo = 1
    ORDER BY Nombre, TipoIncapacidadId;
  `);

  return result.recordset;
}

export async function getTipoIncapacidadById(tipoId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("tipoId", sql.Int, tipoId).query(`
    SELECT TipoIncapacidadId, Codigo, Nombre, EntidadEmisora,
      PorcentajePatronal, Activo
    FROM dbo.TiposIncapacidad
    WHERE TipoIncapacidadId = @tipoId;
  `);

  return result.recordset[0] ?? null;
}

// INCAPACIDADES REPOSITORY
export async function getSolicitudById(solicitudId, transaction = null) {
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

        i.TipoIncapacidadId,
        i.NumeroDocumento,
        i.FechaInicio,
        i.FechaFin,
        i.ComprobanteRuta,
        i.ComprobanteNombre,

        t.Codigo AS CodigoTipoIncapacidad,
        t.Nombre AS TipoIncapacidad,
        t.EntidadEmisora,
        t.PorcentajePatronal

      FROM dbo.Solicitudes AS s

      INNER JOIN dbo.Incapacidades AS i
        ON i.SolicitudId = s.SolicitudId

      INNER JOIN dbo.TiposIncapacidad AS t
        ON t.TipoIncapacidadId = i.TipoIncapacidadId

      WHERE s.SolicitudId = @solicitudId
        AND s.TipoSolicitud = 'INCAPACIDAD';
    `);

  return result.recordset[0] ?? null;
}

export async function getIncapacidadByNumeroDocumento(
  numeroDocumento,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request.input(
    "numeroDocumento",
    sql.NVarChar(50),
    numeroDocumento,
  ).query(`
      SELECT TOP (1) s.SolicitudId, s.TipoSolicitud, s.ColaboradorId,
        s.RestauranteId, s.RegistradoPorUsuarioId, s.Estado, s.Motivo,
        s.RevisadoPorGerenteId, s.RevisadoPorRhId, s.Observacion,
        i.NumeroDocumento
      FROM dbo.Incapacidades AS i
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = i.SolicitudId
      WHERE i.NumeroDocumento = @numeroDocumento
        AND s.TipoSolicitud = 'INCAPACIDAD'
      ORDER BY s.SolicitudId DESC;
    `);
  return result.recordset[0] ?? null;
}

export async function getIncapacidadesByColaborador(
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
        i.NumeroDocumento, i.FechaInicio, i.FechaFin
      FROM dbo.Incapacidades AS i
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = i.SolicitudId
      WHERE s.TipoSolicitud = 'INCAPACIDAD' AND s.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR i.FechaFin >= @desde)
        AND (@hasta IS NULL OR i.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY i.FechaInicio DESC, s.SolicitudId DESC;
    `);

  return result.recordset;
}

export async function getIncapacidadesByRestaurante(
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
        i.NumeroDocumento, i.FechaInicio, i.FechaFin, c.Nombres, c.Apellidos
      FROM dbo.Incapacidades AS i
      INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = i.SolicitudId
      INNER JOIN dbo.Colaboradores AS c ON c.ColaboradorId = s.ColaboradorId
      WHERE s.TipoSolicitud = 'INCAPACIDAD' AND s.RestauranteId = @restauranteId
        AND (@desde IS NULL OR i.FechaFin >= @desde)
        AND (@hasta IS NULL OR i.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)
      ORDER BY i.FechaInicio DESC, s.SolicitudId DESC;
    `);

  return result.recordset;
}

export async function getIncapacidadesSuperpuestas(
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
        i.TipoIncapacidadId,
        i.NumeroDocumento,
        i.FechaInicio,
        i.FechaFin

      FROM dbo.Incapacidades AS i

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado IN ('PENDIENTE', 'EN_REVISION_RH', 'APROBADA')
        AND i.FechaInicio <= @fechaFin
        AND i.FechaFin >= @fechaInicio

      ORDER BY i.FechaInicio, s.SolicitudId;
    `);

  return result.recordset;
}

export async function getIncapacidadAprobadaByFecha(
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
        i.TipoIncapacidadId,
        i.FechaInicio,
        i.FechaFin

      FROM dbo.Incapacidades AS i

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado = 'APROBADA'
        AND @fechaAsignada BETWEEN i.FechaInicio AND i.FechaFin

      ORDER BY i.FechaInicio DESC, s.SolicitudId DESC;
    `);

  return result.recordset[0] ?? null;
}

export async function createIncapacidad(datos, transaction) {
  const solicitudId = await crearCabeceraSolicitud(
    datos,
    "INCAPACIDAD",
    transaction,
  );

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("tipoIncapacidadId", sql.Int, datos.tipoIncapacidadId)
    .input("numeroDocumento", sql.NVarChar(50), datos.numeroDocumento)
    .input("fechaInicio", sql.Date, datos.fechaInicio)
    .input("fechaFin", sql.Date, datos.fechaFin)
    .input("comprobanteRuta", sql.NVarChar(500), datos.comprobanteRuta ?? null)
    .input(
      "comprobanteNombre",
      sql.NVarChar(255),
      datos.comprobanteNombre ?? null,
    ).query(`
      INSERT INTO dbo.Incapacidades (
        SolicitudId, TipoIncapacidadId, NumeroDocumento,
        FechaInicio, FechaFin, ComprobanteRuta, ComprobanteNombre
      )
      VALUES (
        @solicitudId, @tipoIncapacidadId, @numeroDocumento,
        @fechaInicio, @fechaFin, @comprobanteRuta, @comprobanteNombre
      );
  `);

  if (result.rowsAffected[0] !== 1) {
    throw serviceError("No se pudo crear el detalle de la incapacidad", 500);
  }

  return getSolicitudById(solicitudId, transaction);
}

// Explicitamente por gerente
export async function revisarIncapacidadGerente(
  solicitudId,
  datosRevision,
  transaction,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .input("revisadoPorGerenteId", sql.Int, datosRevision.revisadoPorGerenteId)
    .query(`
      UPDATE dbo.Solicitudes
      SET Estado = @estado,
        Observacion = @observacion,
        RevisadoPorGerenteId = @revisadoPorGerenteId
      OUTPUT INSERTED.*
      WHERE SolicitudId = @solicitudId
      AND TipoSolicitud = 'INCAPACIDAD'
      AND Estado = 'PENDIENTE';
    `);

  return result.recordset[0] ?? null;
}

//Explicitamente por RH
export async function resolverIncapacidadRh(
  solicitudId,
  datosRevision,
  transaction,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .input("revisadoPorRhId", sql.Int, datosRevision.revisadoPorRhId)
    .query(`
      UPDATE dbo.Solicitudes
      SET Estado = @estado,
        Observacion = @observacion,
        RevisadoPorRhId = @revisadoPorRhId
      OUTPUT INSERTED.*
      WHERE SolicitudId = @solicitudId
      AND TipoSolicitud = 'INCAPACIDAD'
      AND Estado = 'EN_REVISION_RH';
    `);

  return result.recordset[0] ?? null;
}
