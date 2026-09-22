import { sql, createRequest } from "../../shared/config/database.js";

export async function getPeriodos(transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.query(`
    SELECT
      PeriodoId,
      FechaInicio,
      FechaFin,
      FechaPago,
      FechaLimiteAjustes,
      Estado,
      CreadoPorUsuarioId,
      FechaCreacion
    FROM dbo.PeriodosPlanilla
    ORDER BY FechaInicio DESC;
  `);

  return result.recordset || [];
}

export async function getPeriodoById(periodoId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("PeriodoId", sql.Int, periodoId).query(`
      SELECT
        PeriodoId,
        FechaInicio,
        FechaFin,
        FechaPago,
        FechaLimiteAjustes,
        Estado,
        CreadoPorUsuarioId,
        FechaCreacion
      FROM dbo.PeriodosPlanilla
      WHERE PeriodoId = @PeriodoId;
    `);

  return result.recordset[0] ?? null;
}

export async function getPeriodoByFecha(fechaAsignada, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("FechaAsignada", sql.Date, fechaAsignada)
    .query(`
      SELECT
        PeriodoId,
        FechaInicio,
        FechaFin,
        FechaPago,
        FechaLimiteAjustes,
        Estado,
        CreadoPorUsuarioId,
        FechaCreacion
      FROM dbo.PeriodosPlanilla
      WHERE @FechaAsignada BETWEEN FechaInicio AND FechaFin;
    `);

  return result.recordset[0] ?? null;
}

// Verificar si el rango propuesto coincide con algún período existente.
// Al crear períodos, se debe consultar dentro de la misma transacción
// utilizada para insertar el nuevo registro.
export async function existeSuperposicion(
  fechaInicio,
  fechaFin,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("FechaInicio", sql.Date, fechaInicio)
    .input("FechaFin", sql.Date, fechaFin).query(`
      SELECT TOP (1) PeriodoId
      FROM dbo.PeriodosPlanilla WITH (UPDLOCK, HOLDLOCK)
      WHERE FechaInicio <= @FechaFin
        AND FechaFin >= @FechaInicio;
    `);

  return result.recordset.length > 0;
}

export async function createPeriodo(periodo, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request
    .input("FechaInicio", sql.Date, periodo.fechaInicio)
    .input("FechaFin", sql.Date, periodo.fechaFin)
    .input("FechaPago", sql.Date, periodo.fechaPago)
    .input("FechaLimiteAjustes", sql.Date, periodo.fechaLimiteAjustes)
    .input("CreadoPorUsuarioId", sql.Int, periodo.creadoPorUsuarioId).query(`
      INSERT INTO dbo.PeriodosPlanilla (
        FechaInicio,
        FechaFin,
        FechaPago,
        FechaLimiteAjustes,
        CreadoPorUsuarioId
      )
      OUTPUT INSERTED.*
      VALUES (
        @FechaInicio,
        @FechaFin,
        @FechaPago,
        @FechaLimiteAjustes,
        @CreadoPorUsuarioId
      );
    `);

  return result.recordset[0];
}

// Actualizar solamente si el estado sigue siendo el que consultamos.
export async function updateEstadoPeriodo(
  periodoId,
  estadoActual,
  nuevoEstado,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = request
    .input("PeriodoId", sql.Int, periodoId)
    .input("EstadoActual", sql.VarChar(15), estadoActual)
    .input("NuevoEstado", sql.VarChar(15), nuevoEstado).query(`
      UPDATE dbo.PeriodosPlanilla
      SET Estado = @NuevoEstado
      OUTPUT INSERTED.*
      WHERE PeriodoId = @PeriodoId
      AND Estado = @EstadoActual
    `);

    return result.recordset[0];
}