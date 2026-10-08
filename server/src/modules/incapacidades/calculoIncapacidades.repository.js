import { createRequest, sql } from "../../shared/config/database.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

// Obtener el cálculo asociado a una solicitud.
export async function getCalculoBySolicitud(
  solicitudId,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT
        CalculoId,
        SolicitudId,
        PeriodoId,
        MinutosReconocidos,
        PorcentajePatronalAplicado
      FROM dbo.CalculosIncapacidad
      WHERE SolicitudId = @solicitudId;
    `);

  return result.recordset[0] ?? null;
}

// Obtener los cálculos que se reconocerán en una planilla.
export async function getCalculosByPeriodo(
  periodoId,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        ci.CalculoId,
        ci.SolicitudId,
        ci.PeriodoId,
        ci.MinutosReconocidos,
        ci.PorcentajePatronalAplicado,

        s.ColaboradorId,
        s.RestauranteId,

        i.TipoIncapacidadId,
        i.FechaInicio,
        i.FechaFin

      FROM dbo.CalculosIncapacidad AS ci

      INNER JOIN dbo.Incapacidades AS i
        ON i.SolicitudId = ci.SolicitudId

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId

      WHERE ci.PeriodoId = @periodoId
        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado = 'APROBADA'

      ORDER BY s.ColaboradorId, i.FechaInicio, ci.CalculoId;
    `);

  return result.recordset;
}

// Obtener antecedentes aprobados anteriores a la nueva incapacidad.
export async function getIncapacidadesAprobadasAnteriores(
  colaboradorId,
  fechaInicio,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fechaInicio", sql.Date, fechaInicio)
    .query(`
      SELECT
        s.SolicitudId,
        i.TipoIncapacidadId,
        t.Codigo AS CodigoTipoIncapacidad,
        i.FechaInicio,
        i.FechaFin

      FROM dbo.Incapacidades AS i

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId

      INNER JOIN dbo.TiposIncapacidad AS t
        ON t.TipoIncapacidadId = i.TipoIncapacidadId

      WHERE s.ColaboradorId = @colaboradorId
        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado = 'APROBADA'
        AND i.FechaFin < @fechaInicio

      ORDER BY i.FechaFin DESC, s.SolicitudId DESC;
    `);

  return result.recordset;
}

// Guardar el resultado calculado por el servicio.
export async function createCalculoIncapacidad(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el cálculo de incapacidad",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, datos.solicitudId)
    .input("periodoId", sql.Int, datos.periodoId)
    .input("minutosReconocidos", sql.Int, datos.minutosReconocidos)
    .input(
      "porcentajePatronalAplicado",
      sql.Decimal(5, 2),
      datos.porcentajePatronalAplicado,
    )
    .query(`
      INSERT INTO dbo.CalculosIncapacidad (
        SolicitudId,
        PeriodoId,
        MinutosReconocidos,
        PorcentajePatronalAplicado
      )
      OUTPUT
        INSERTED.CalculoId,
        INSERTED.SolicitudId,
        INSERTED.PeriodoId,
        INSERTED.MinutosReconocidos,
        INSERTED.PorcentajePatronalAplicado
      SELECT
        i.SolicitudId,
        @periodoId,
        @minutosReconocidos,
        @porcentajePatronalAplicado
      FROM dbo.Incapacidades AS i
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId
      WHERE i.SolicitudId = @solicitudId
        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado = 'APROBADA';
    `);

  return result.recordset[0] ?? null;
}