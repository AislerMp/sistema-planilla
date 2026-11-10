import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

import { crearCabeceraSolicitud } from "../../solicitudes/solicitudes.repository.js";

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

        sd.DeduccionId,
        sd.PorcentajeSolicitado,
        sd.FechaInicio,
        sd.FechaFin,
        sd.Autorizacion,

        d.Nombre AS NombreDeduccion,
        d.Codigo,
        d.TipoDeduccion,
        d.EntidadReceptora,

        c.Nombres,
        c.Apellido1, c.Apellido2,
        r.Nombre AS Restaurante

      FROM dbo.SolicitudesDeducciones AS sd
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = sd.SolicitudId
      INNER JOIN dbo.Deducciones AS d
        ON d.DeduccionId = sd.DeduccionId
      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId
      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = s.RestauranteId

      WHERE s.SolicitudId = @solicitudId
        AND s.TipoSolicitud = 'DEDUCCION';
    `);

  return result.recordset[0] ?? null;
}

// Busca solicitudes cuya aplicación coincide con el rango consultado.
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

        sd.DeduccionId,
        sd.PorcentajeSolicitado,
        sd.FechaInicio,
        sd.FechaFin,
        sd.Autorizacion,

        d.Nombre AS NombreDeduccion,
        d.Codigo,
        d.TipoDeduccion,
        d.EntidadReceptora

      FROM dbo.SolicitudesDeducciones AS sd
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = sd.SolicitudId
      INNER JOIN dbo.Deducciones AS d
        ON d.DeduccionId = sd.DeduccionId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'DEDUCCION'
        AND (
          @desde IS NULL
          OR sd.FechaFin IS NULL
          OR sd.FechaFin >= @desde
        )
        AND (@hasta IS NULL OR sd.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)

      ORDER BY sd.FechaInicio DESC, s.SolicitudId DESC;
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

        sd.DeduccionId,
        sd.PorcentajeSolicitado,
        sd.FechaInicio,
        sd.FechaFin,
        sd.Autorizacion,

        d.Nombre AS NombreDeduccion,
        d.Codigo,
        d.TipoDeduccion,
        d.EntidadReceptora,

        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.Identificacion,
        r.Nombre AS Restaurante

      FROM dbo.SolicitudesDeducciones AS sd
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = sd.SolicitudId
      INNER JOIN dbo.Deducciones AS d
        ON d.DeduccionId = sd.DeduccionId
      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId
      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = s.RestauranteId

      WHERE (@restauranteId IS NULL OR s.RestauranteId = @restauranteId)
        AND s.TipoSolicitud = 'DEDUCCION'
        AND (
          @desde IS NULL
          OR sd.FechaFin IS NULL
          OR sd.FechaFin >= @desde
        )
        AND (@hasta IS NULL OR sd.FechaInicio <= @hasta)
        AND (@estado IS NULL OR s.Estado = @estado)

      ORDER BY
        sd.FechaInicio DESC,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        s.SolicitudId DESC;
    `);

  return result.recordset;
}

// Compara por código para detectar el mismo concepto entre versiones.
// Las solicitudes rechazadas no bloquean una nueva solicitud.
export async function getSolicitudesSuperpuestas(
  colaboradorId,
  codigo,
  fechaInicio,
  fechaFin,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("codigo", sql.VarChar(50), codigo)
    .input("fechaInicio", sql.Date, fechaInicio)
    .input("fechaFin", sql.Date, fechaFin ?? null).query(`
      SELECT
        s.SolicitudId,
        s.Estado,
        sd.DeduccionId,
        sd.PorcentajeSolicitado,
        sd.FechaInicio,
        sd.FechaFin

      FROM dbo.SolicitudesDeducciones AS sd
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = sd.SolicitudId
      INNER JOIN dbo.Deducciones AS d
        ON d.DeduccionId = sd.DeduccionId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'DEDUCCION'
        AND s.Estado IN ('PENDIENTE', 'APROBADA')
        AND d.Codigo = @codigo
        AND (@fechaFin IS NULL OR sd.FechaInicio <= @fechaFin)
        AND (sd.FechaFin IS NULL OR sd.FechaFin >= @fechaInicio)

      ORDER BY sd.FechaInicio, s.SolicitudId;
    `);

  return result.recordset;
}

export async function createSolicitud(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para crear la solicitud.",
      500,
    );
  }

  const solicitudId = await crearCabeceraSolicitud(
    {
      ...datos,
      motivo: datos.motivo ?? null,
    },
    "DEDUCCION",
    transaction,
  );

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("deduccionId", sql.Int, datos.deduccionId)
    .input(
      "porcentajeSolicitado",
      sql.Decimal(5, 2),
      datos.porcentajeSolicitado,
    )
    .input("fechaInicio", sql.Date, datos.fechaInicio)
    .input("fechaFin", sql.Date, datos.fechaFin ?? null)
    .input("autorizacion", sql.Bit, datos.autorizacion).query(`
      INSERT INTO dbo.SolicitudesDeducciones (
        SolicitudId,
        DeduccionId,
        PorcentajeSolicitado,
        FechaInicio,
        FechaFin,
        Autorizacion
      )
      OUTPUT INSERTED.SolicitudId
      VALUES (
        @solicitudId,
        @deduccionId,
        @porcentajeSolicitado,
        @fechaInicio,
        @fechaFin,
        @autorizacion
      );
    `);

  if (!result.recordset[0]) {
    throw serviceError(
      "No se pudo crear el detalle de la deducción solicitada.",
      500,
    );
  }

  return getSolicitudById(solicitudId, transaction);
}

// RH resuelve estas solicitudes directamente desde PENDIENTE.
export async function resolverSolicitudRh(
  solicitudId,
  datosRevision,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para resolver la solicitud.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("revisadoPorRhId", sql.Int, datosRevision.revisadoPorRhId)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .query(`
      UPDATE dbo.Solicitudes
      SET
        Estado = @estado,
        RevisadoPorRhId = @revisadoPorRhId,
        Observacion = @observacion
      OUTPUT INSERTED.SolicitudId

      WHERE SolicitudId = @solicitudId
        AND TipoSolicitud = 'DEDUCCION'
        AND Estado = 'PENDIENTE'
        AND @estado IN ('APROBADA', 'RECHAZADA');
    `);

  if (!result.recordset[0]) return null;

  return getSolicitudById(solicitudId, transaction);
}

export async function finalizarDeduccion(solicitudId, fechaFin, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para finalizar la deducción.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("fechaFin", sql.Date, fechaFin)
    .query(`
      UPDATE dbo.Solicitudes
      SET FechaFin = @fechaFin
      OUTPUT INSERTED.*
      WHERE SolicitudId = @solicitudId
        AND TipoSolicitud = 'DEDUCCION'
        AND Estado = 'APROBADA';
    `);

  if (!result.recordset[0]) return null;

  return getSolicitudById(solicitudId, transaction);
}
