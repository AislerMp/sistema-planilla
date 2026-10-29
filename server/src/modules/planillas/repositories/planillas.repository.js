import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getPlanillas(transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.query(`
    SELECT
      PlanillaId, PeriodoId, FechaPago, RegistradoPorUsuarioId,
      TotalIngresos, TotalDeducciones, TotalNeto
    FROM dbo.Planillas
    ORDER BY FechaPago DESC, PlanillaId DESC;
  `);

  return result.recordset;
}

export async function getPlanillaById(planillaId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("planillaId", sql.Int, planillaId).query(`
    SELECT
      PlanillaId, PeriodoId, FechaPago, RegistradoPorUsuarioId,
      TotalIngresos, TotalDeducciones, TotalNeto
    FROM dbo.Planillas
    WHERE PlanillaId = @planillaId;
  `);

  return result.recordset[0] ?? null;
}

export async function getPlanillaByPeriodo(periodoId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("periodoId", sql.Int, periodoId).query(`
    SELECT
      PlanillaId, PeriodoId, FechaPago, RegistradoPorUsuarioId,
      TotalIngresos, TotalDeducciones, TotalNeto
    FROM dbo.Planillas
    WHERE PeriodoId = @periodoId;
  `);

  return result.recordset[0] ?? null;
}

// Recibe los totales ya calculados. La transacción la administra el servicio.
export async function createPlanilla(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar la planilla.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("periodoId", sql.Int, datos.periodoId)
    .input("fechaPago", sql.Date, datos.fechaPago)
    .input("registradoPorUsuarioId", sql.Int, datos.registradoPorUsuarioId)
    .input("totalIngresos", sql.Decimal(14, 2), datos.totalIngresos)
    .input("totalDeducciones", sql.Decimal(14, 2), datos.totalDeducciones)
    .input("totalNeto", sql.Decimal(14, 2), datos.totalNeto).query(`
      INSERT INTO dbo.Planillas (
        PeriodoId, FechaPago, RegistradoPorUsuarioId,
        TotalIngresos, TotalDeducciones, TotalNeto
      )
      OUTPUT INSERTED.*
      VALUES (
        @periodoId, @fechaPago, @registradoPorUsuarioId,
        @totalIngresos, @totalDeducciones, @totalNeto
      );
    `);

  return result.recordset[0] ?? null;
}

export async function updateTotalesPlanilla(planillaId, datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar la planilla.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("planillaId", sql.Int, planillaId)
    .input("totalIngresos", sql.Decimal(14, 2), datos.totalIngresos)
    .input("totalDeducciones", sql.Decimal(14, 2), datos.totalDeducciones)
    .input("totalNeto", sql.Decimal(14, 2), datos.totalNeto).query(`
      UPDATE dbo.Planillas
      SET TotalIngresos = @totalIngresos,
          TotalDeducciones = @totalDeducciones,
          TotalNeto = @totalNeto
      OUTPUT INSERTED.*
      WHERE PlanillaId = @planillaId;
    `);

  return result.recordset[0] ?? null;
}
