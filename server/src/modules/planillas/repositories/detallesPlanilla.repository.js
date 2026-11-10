import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getDetalleById(detallePlanillaId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input(
    "detallePlanillaId",
    sql.Int,
    detallePlanillaId,
  ).query(`
      SELECT
        DetallePlanillaId, PlanillaId, ColaboradorId, RestauranteId,
        TarifaHoraAplicada, TotalIngresos, TotalDeducciones, TotalNeto
      FROM dbo.DetallesPlanilla
      WHERE DetallePlanillaId = @detallePlanillaId;
    `);

  return result.recordset[0] ?? null;
}

// Funcion para RH
export async function getDetallesByPlanilla(
  planillaId,
  restauranteId = null,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("planillaId", sql.Int, planillaId)
    .input("restauranteId", sql.Int, restauranteId).query(`
    SELECT
      c.Nombres AS ColaboradorNombre, c.Apellido1 AS ColaboradorApellido1, c.Apellido2 AS ColaboradorApellido2,
      r.Nombre AS RestauranteNombre,
      dp.DetallePlanillaId, dp.PlanillaId, dp.ColaboradorId, dp.RestauranteId,
      dp.TarifaHoraAplicada, dp.TotalIngresos, dp.TotalDeducciones, dp.TotalNeto
    FROM dbo.DetallesPlanilla AS dp
    JOIN dbo.Colaboradores AS c ON dp.ColaboradorId = c.ColaboradorId
    JOIN dbo.Restaurantes AS r ON dp.RestauranteId = r.RestauranteId
    WHERE dp.PlanillaId = @planillaId
      AND (@restauranteId IS NULL OR dp.RestauranteId = @restauranteId)
    ORDER BY dp.ColaboradorId;
  `);

  return result.recordset;
}

// Esta funcion obtiene el detalle de un colaborador para un periodo específico seleccionado.
export async function getDetallesColaboradorByPeriodo(
  periodoId = null,
  colaboradorId,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("periodoId", sql.Int, periodoId)
    .input("colaboradorId", sql.Int, colaboradorId).query(`
    SELECT
      c.Nombres AS ColaboradorNombre, c.Apellido1 AS ColaboradorApellido1, c.Apellido2 AS ColaboradorApellido2,
      r.Nombre AS RestauranteNombre,
      dp.DetallePlanillaId, dp.PlanillaId, dp.ColaboradorId, dp.RestauranteId,
      dp.TarifaHoraAplicada, dp.TotalIngresos, dp.TotalDeducciones, dp.TotalNeto
    FROM dbo.DetallesPlanilla AS dp
    JOIN dbo.Colaboradores AS c ON dp.ColaboradorId = c.ColaboradorId
    JOIN dbo.Planillas AS p ON dp.PlanillaId = p.PlanillaId
    JOIN dbo.Restaurantes AS r ON dp.RestauranteId = r.RestauranteId
    WHERE dp.ColaboradorId = @colaboradorId
      AND (@periodoId IS NULL OR p.PeriodoId = @periodoId)
    ORDER BY dp.ColaboradorId;
  `);

  return result.recordset[0] ?? null;
}

export async function getSalariosParaPromedio(
  colaboradorId,
  desde,
  hasta,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta)
    .query(`
      SELECT
        dp.DetallePlanillaId,
        dp.TarifaHoraAplicada,

        p.PlanillaId,
        p.FechaPago,

        pp.PeriodoId,
        pp.FechaInicio,
        pp.FechaFin,

        cp.ConceptoPlanillaId,
        cp.CodigoConcepto,
        cp.Monto
        
      FROM dbo.DetallesPlanilla AS dp

      INNER JOIN dbo.Planillas AS p
        ON p.PlanillaId = dp.PlanillaId

      INNER JOIN dbo.PeriodosPlanilla AS pp
        ON pp.PeriodoId = p.PeriodoId

      INNER JOIN dbo.ConceptosPlanilla AS cp
        ON cp.DetallePlanillaId = dp.DetallePlanillaId

      WHERE dp.ColaboradorId = @colaboradorId
        AND pp.Estado = 'PAGADO'

        -- Períodos que contienen al menos un día del rango.
        AND pp.FechaInicio <= @hasta
        AND pp.FechaFin >= @desde

        AND cp.TipoConcepto = 'INGRESO'
        AND cp.CodigoConcepto IN (
          'ORDINARIAS',
          'EXTRAS',
          'ORDINARIAS_FERIADO',
          'EXTRAS_FERIADO',
          'VACACIONES',
          'MATERNIDAD_CCSS'
        )

      ORDER BY
        pp.FechaInicio,
        dp.DetallePlanillaId,
        cp.ConceptoPlanillaId;
    `);

  return result.recordset ?? [];
}

// Esta funcion obtiene todos los detalles de planilla de un colaborador.
export async function getDetallesByColaborador(
  colaboradorId,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query(`
      SELECT
        c.Nombres AS ColaboradorNombre, c.Apellido1 AS ColaboradorApellido1, c.Apellido2 AS ColaboradorApellido2,
        dp.DetallePlanillaId, dp.PlanillaId, dp.ColaboradorId, dp.RestauranteId,
        dp.TarifaHoraAplicada, dp.TotalIngresos, dp.TotalDeducciones, dp.TotalNeto
      FROM dbo.DetallesPlanilla AS dp
      JOIN 
        dbo.Colaboradores AS c ON dp.ColaboradorId = c.ColaboradorId
      WHERE dp.ColaboradorId = @colaboradorId
      ORDER BY dp.PlanillaId DESC;
    `);

  return result.recordset;
}

// Esta funcion obtiene todos los detalles de planilla de un restaurante por periodo específico.
export async function getDetallesByRestaurante(
  restauranteId,
  periodoId = null,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("restauranteId", sql.Int, restauranteId)
    .input("periodoId", sql.Int, periodoId).query(`
    SELECT
      c.Nombres AS ColaboradorNombre, c.Apellido1 AS ColaboradorApellido1, c.Apellido2 AS ColaboradorApellido2,
      r.Nombre AS RestauranteNombre,
      dp.DetallePlanillaId, dp.PlanillaId, dp.ColaboradorId, dp.RestauranteId,
      dp.TarifaHoraAplicada, dp.TotalIngresos, dp.TotalDeducciones, dp.TotalNeto
    FROM dbo.DetallesPlanilla AS dp
    JOIN dbo.Colaboradores AS c ON dp.ColaboradorId = c.ColaboradorId
    JOIN dbo.Planillas AS p ON dp.PlanillaId = p.PlanillaId
    JOIN dbo.Restaurantes AS r ON dp.RestauranteId = r.RestauranteId
    WHERE (@periodoId IS NULL OR p.PeriodoId = @periodoId)
      AND dp.RestauranteId = @restauranteId
    ORDER BY dp.PlanillaId DESC;
  `);

  return result.recordset;
}

// Guarda el resumen calculado para un colaborador, sin recalcular sus importes.
export async function createDetallePlanilla(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el detalle de planilla.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("planillaId", sql.Int, datos.planillaId)
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("tarifaHoraAplicada", sql.Decimal(12, 2), datos.tarifaHoraAplicada)
    .input("totalIngresos", sql.Decimal(14, 2), datos.totalIngresos)
    .input("totalDeducciones", sql.Decimal(14, 2), datos.totalDeducciones)
    .input("totalNeto", sql.Decimal(14, 2), datos.totalNeto).query(`
      INSERT INTO dbo.DetallesPlanilla (
        PlanillaId, ColaboradorId, RestauranteId, TarifaHoraAplicada,
        TotalIngresos, TotalDeducciones, TotalNeto
      )
      OUTPUT INSERTED.*
      VALUES (
        @planillaId, @colaboradorId, @restauranteId, @tarifaHoraAplicada,
        @totalIngresos, @totalDeducciones, @totalNeto
      );
    `);

  return result.recordset[0] ?? null;
}
