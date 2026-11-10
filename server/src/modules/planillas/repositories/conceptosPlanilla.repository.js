import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getConceptoById(conceptoPlanillaId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input(
    "conceptoPlanillaId",
    sql.Int,
    conceptoPlanillaId,
  ).query(`
      SELECT
        ConceptoPlanillaId, DetallePlanillaId, TipoConcepto, CodigoConcepto,
        TipoJornada, Minutos, FactorAplicado, Monto
      FROM dbo.ConceptosPlanilla
      WHERE ConceptoPlanillaId = @conceptoPlanillaId;
    `);

  return result.recordset[0] ?? null;
}

export async function getConceptosByDetalle(
  detallePlanillaId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request.input(
    "detallePlanillaId",
    sql.Int,
    detallePlanillaId,
  ).query(`
      SELECT
        cp.ConceptoPlanillaId, cp.DetallePlanillaId, cp.TipoConcepto, cp.CodigoConcepto,
        cp.TipoJornada, cp.Minutos, cp.FactorAplicado, cp.Monto,
        dp.TotalIngresos, dp.TotalDeducciones, dp.TotalNeto,
        c.Nombres AS ColaboradorNombre, c.Apellido1 AS ColaboradorApellido1, c.Apellido2 AS ColaboradorApellido2,
        r.Nombre AS RestauranteNombre,
        p.FechaPago, pp.PeriodoId, pp.FechaInicio, pp.FechaFin, pp.Estado AS EstadoPeriodo
      FROM dbo.ConceptosPlanilla AS cp
      JOIN dbo.DetallesPlanilla AS dp ON dp.DetallePlanillaId = cp.DetallePlanillaId
      JOIN dbo.Colaboradores AS c ON c.ColaboradorId = dp.ColaboradorId
      JOIN dbo.Restaurantes AS r ON r.RestauranteId = dp.RestauranteId
      JOIN dbo.Planillas AS p ON p.PlanillaId = dp.PlanillaId
      JOIN dbo.PeriodosPlanilla AS pp ON pp.PeriodoId = p.PeriodoId
      WHERE cp.DetallePlanillaId = @detallePlanillaId
      ORDER BY cp.ConceptoPlanillaId;
    `);

  return result.recordset;
}

// FactorAplicado en deducciones es una fracción: 0.05 representa un 5 %.
export async function createConceptoPlanilla(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el concepto de planilla.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("detallePlanillaId", sql.Int, datos.detallePlanillaId)
    .input("tipoConcepto", sql.VarChar(10), datos.tipoConcepto)
    .input("codigoConcepto", sql.VarChar(50), datos.codigoConcepto)
    .input("tipoJornada", sql.VarChar(8), datos.tipoJornada ?? null)
    .input("minutos", sql.Int, datos.minutos ?? null)
    .input("factorAplicado", sql.Decimal(10, 6), datos.factorAplicado)
    .input("monto", sql.Decimal(14, 2), datos.monto).query(`
      INSERT INTO dbo.ConceptosPlanilla (
        DetallePlanillaId, TipoConcepto, CodigoConcepto,
        TipoJornada, Minutos, FactorAplicado, Monto
      )
      OUTPUT INSERTED.*
      VALUES (
        @detallePlanillaId, @tipoConcepto, @codigoConcepto,
        @tipoJornada, @minutos, @factorAplicado, @monto
      );
    `);

  return result.recordset[0] ?? null;
}
