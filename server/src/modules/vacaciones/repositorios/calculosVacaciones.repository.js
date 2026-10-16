import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getCalculosBySolicitud(
  solicitudId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .query(`
      SELECT
        CalculoVacacionId,
        SolicitudId,
        PeriodoId,
        FechaInicioReconocida,
        FechaFinReconocida,
        DiasReconocidos,
        MinutosReconocidos
      FROM dbo.CalculosVacaciones
      WHERE SolicitudId = @solicitudId
      ORDER BY FechaInicioReconocida, PeriodoId;
    `);

  return result.recordset;
}

export async function getCalculosByPeriodo(periodoId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        cv.CalculoVacacionId,
        cv.SolicitudId,
        cv.PeriodoId,
        cv.FechaInicioReconocida,
        cv.FechaFinReconocida,
        cv.DiasReconocidos,
        cv.MinutosReconocidos,
        s.ColaboradorId,
        s.RestauranteId,
        c.Nombres,
        c.Apellidos,
        v.FechaInicio,
        v.FechaFin,
        v.DiasSolicitados
      FROM dbo.CalculosVacaciones AS cv
      INNER JOIN dbo.Vacaciones AS v
        ON v.SolicitudId = cv.SolicitudId
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = cv.SolicitudId
      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId
      WHERE cv.PeriodoId = @periodoId
        AND s.TipoSolicitud = 'VACACIONES'
        AND s.Estado = 'APROBADA'
      ORDER BY
        s.ColaboradorId,
        cv.FechaInicioReconocida,
        cv.CalculoVacacionId;
    `);

  return result.recordset;
}

export async function createCalculo(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el cálculo de vacaciones.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, datos.solicitudId)
    .input("periodoId", sql.Int, datos.periodoId)
    .input("fechaInicioReconocida", sql.Date, datos.fechaInicioReconocida)
    .input("fechaFinReconocida", sql.Date, datos.fechaFinReconocida)
    .input("diasReconocidos", sql.Int, datos.diasReconocidos)
    .input("minutosReconocidos", sql.Int, datos.minutosReconocidos)
    .query(`
      INSERT INTO dbo.CalculosVacaciones (
        SolicitudId,
        PeriodoId,
        FechaInicioReconocida,
        FechaFinReconocida,
        DiasReconocidos,
        MinutosReconocidos
      )
      OUTPUT
        INSERTED.CalculoVacacionId,
        INSERTED.SolicitudId,
        INSERTED.PeriodoId,
        INSERTED.FechaInicioReconocida,
        INSERTED.FechaFinReconocida,
        INSERTED.DiasReconocidos,
        INSERTED.MinutosReconocidos
      SELECT
        v.SolicitudId,
        pp.PeriodoId,
        @fechaInicioReconocida,
        @fechaFinReconocida,
        @diasReconocidos,
        @minutosReconocidos
      FROM dbo.Vacaciones AS v
      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = v.SolicitudId
      INNER JOIN dbo.PeriodosPlanilla AS pp
        ON pp.PeriodoId = @periodoId
      WHERE v.SolicitudId = @solicitudId
        AND s.TipoSolicitud = 'VACACIONES'
        AND s.Estado = 'APROBADA'
        AND @fechaInicioReconocida >= v.FechaInicio
        AND @fechaFinReconocida <= v.FechaFin
        AND @fechaInicioReconocida >= pp.FechaInicio
        AND @fechaFinReconocida <= pp.FechaFin;
    `);

  return result.recordset[0] ?? null;
}

export async function getCalculoBySolicitudYPeriodo(
  solicitudId,
  periodoId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        CalculoVacacionId,
        SolicitudId,
        PeriodoId,
        FechaInicioReconocida,
        FechaFinReconocida,
        DiasReconocidos,
        MinutosReconocidos
      FROM dbo.CalculosVacaciones
      WHERE SolicitudId = @solicitudId
        AND PeriodoId = @periodoId;
    `);

  return result.recordset[0] ?? null;
}
