import { createRequest, sql } from "../../shared/config/database.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

export async function getAguinaldos(transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.query(`
      SELECT 
        AguinaldoId,
        Anio,
        Estado,
        TotalAguinaldo,
        RegistradoPorUsuarioId
      FROM dbo.Aguinaldos
    `);

  return result.recordset ?? [];
}

export async function getAguinaldoById(aguinaldoId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("AguinaldoId", sql.Int, aguinaldoId)
    .query(`
      SELECT 
        AguinaldoId,
        Anio,
        Estado,
        TotalAguinaldo,
        RegistradoPorUsuarioId
      FROM dbo.Aguinaldos
      WHERE AguinaldoId = @AguinaldoId
    `);

  return result.recordset[0] ?? null;
}

export async function getAguinaldoByAnio(anio, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("Anio", sql.Int, anio).query(`
      SELECT 
        AguinaldoId,
        Anio,
        Estado,
        TotalAguinaldo,
        RegistradoPorUsuarioId
      FROM dbo.Aguinaldos
      WHERE Anio = @Anio
    `);

  return result.recordset[0] ?? null;
}

export async function createAguinaldo(datos, transaction) {
  const request = await createRequest(transaction);

  const result = await request
    .input("Anio", sql.Int, datos.anio)
    .input("TotalAguinaldo", sql.Decimal(18, 2), datos.totalAguinaldo)
    .input("RegistradoPorUsuarioId", sql.Int, datos.registradoPorUsuarioId)
    .input("Estado", sql.VarChar(50), datos.estado ?? "PENDIENTE")
    .query(`
        INSERT INTO dbo.Aguinaldos (Anio, TotalAguinaldo, RegistradoPorUsuarioId, Estado)
        OUTPUT INSERTED.*
        VALUES (@Anio, @TotalAguinaldo, @RegistradoPorUsuarioId, @Estado)
      `);

  return result.recordset[0] ?? null;
}

export async function getSalariosAcumulados(
  desde,
  hasta,
  filtros = {},
  transaction = null,
) {
  const { colaboradorId, restauranteId } = filtros;
  const request = await createRequest(transaction);

  const result = await request
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta)
    .input("colaboradorId", sql.Int, colaboradorId ?? null)
    .input("restauranteId", sql.Int, restauranteId ?? null).query(`
      SELECT
        c.ColaboradorId,
        c.RestauranteId,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.Identificacion,
        r.Nombre AS Restaurante,

        SUM(cp.Monto) AS SalarioAcumulado

      FROM dbo.ConceptosPlanilla AS cp

      INNER JOIN dbo.DetallesPlanilla AS dp
        ON dp.DetallePlanillaId = cp.DetallePlanillaId

      INNER JOIN dbo.Planillas AS p
        ON p.PlanillaId = dp.PlanillaId

      INNER JOIN dbo.PeriodosPlanilla AS pp
        ON pp.PeriodoId = p.PeriodoId

      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = dp.ColaboradorId

      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = c.RestauranteId

      WHERE pp.Estado = 'PAGADO'
        AND p.FechaPago >= @desde
        AND p.FechaPago <= @hasta

        AND cp.TipoConcepto = 'INGRESO'
        AND cp.CodigoConcepto IN (
          'ORDINARIAS',
          'EXTRAS',
          'ORDINARIAS_FERIADO',
          'EXTRAS_FERIADO',
          'VACACIONES'
        )

        AND (
          @colaboradorId IS NULL
          OR c.ColaboradorId = @colaboradorId
        )

        AND (
          @restauranteId IS NULL
          OR c.RestauranteId = @restauranteId
        )

      GROUP BY
        c.ColaboradorId,
        c.RestauranteId,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.Identificacion,
        r.Nombre

      ORDER BY
        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.ColaboradorId;
    `);

  return result.recordset ?? [];
}

export async function getMaternidadesPagadas(
  desde,
  hasta,
  filtros = {},
  transaction = null,
) {
  const { colaboradorId, restauranteId } = filtros;
  const request = await createRequest(transaction);

  const result = await request
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta)
    .input("colaboradorId", sql.Int, colaboradorId ?? null)
    .input("restauranteId", sql.Int, restauranteId ?? null).query(`
      SELECT
        ci.CalculoId,
        ci.SolicitudId,
        ci.PeriodoId,
        ci.MinutosReconocidos,
        ci.PorcentajePatronalAplicado,

        dp.TarifaHoraAplicada,
        p.FechaPago,

        c.ColaboradorId,
        c.RestauranteId,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.Identificacion,
        r.Nombre AS Restaurante

      FROM dbo.CalculosIncapacidad AS ci

      INNER JOIN dbo.Incapacidades AS i
        ON i.SolicitudId = ci.SolicitudId

      INNER JOIN dbo.Solicitudes AS s
        ON s.SolicitudId = i.SolicitudId

      INNER JOIN dbo.TiposIncapacidad AS ti
        ON ti.TipoIncapacidadId = i.TipoIncapacidadId

      INNER JOIN dbo.Planillas AS p
        ON p.PeriodoId = ci.PeriodoId

      INNER JOIN dbo.PeriodosPlanilla AS pp
        ON pp.PeriodoId = p.PeriodoId

      INNER JOIN dbo.DetallesPlanilla AS dp
        ON dp.PlanillaId = p.PlanillaId
        AND dp.ColaboradorId = s.ColaboradorId

      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = s.ColaboradorId

      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = c.RestauranteId

      WHERE pp.Estado = 'PAGADO'
        AND p.FechaPago >= @desde
        AND p.FechaPago <= @hasta

        AND s.TipoSolicitud = 'INCAPACIDAD'
        AND s.Estado = 'APROBADA'
        AND ti.Codigo = 'MATERNIDAD_CCSS'

        AND (
          @colaboradorId IS NULL
          OR c.ColaboradorId = @colaboradorId
        )

        AND (
          @restauranteId IS NULL
          OR c.RestauranteId = @restauranteId
        )

      ORDER BY
        c.ColaboradorId,
        p.FechaPago,
        ci.CalculoId;
    `);

  return result.recordset ?? [];
}

export async function getDetallesAguinaldo(filtros = {}, transaction = null) {
  const { aguinaldoId, anio, colaboradorId, restauranteId } = filtros;

  const request = await createRequest(transaction);

  const result = await request
    .input("aguinaldoId", sql.Int, aguinaldoId ?? null)
    .input("anio", sql.Int, anio ?? null)
    .input("colaboradorId", sql.Int, colaboradorId ?? null)
    .input("restauranteId", sql.Int, restauranteId ?? null).query(`
      SELECT
        da.DetalleAguinaldoId,
        da.AguinaldoId,

        a.Anio,
        a.Estado,

        da.ColaboradorId,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        c.Identificacion,

        da.RestauranteId,
        r.Nombre AS Restaurante,

        da.SalarioAcumulado,
        da.MontoAguinaldo

      FROM dbo.DetallesAguinaldo AS da

      INNER JOIN dbo.Aguinaldos AS a
        ON a.AguinaldoId = da.AguinaldoId

      INNER JOIN dbo.Colaboradores AS c
        ON c.ColaboradorId = da.ColaboradorId

      INNER JOIN dbo.Restaurantes AS r
        ON r.RestauranteId = da.RestauranteId

      WHERE a.Estado = 'CONFIRMADO'

        AND (
          @aguinaldoId IS NULL
          OR da.AguinaldoId = @aguinaldoId
        )

        AND (
          @anio IS NULL
          OR a.Anio = @anio
        )

        AND (
          @colaboradorId IS NULL
          OR da.ColaboradorId = @colaboradorId
        )

        AND (
          @restauranteId IS NULL
          OR da.RestauranteId = @restauranteId
        )

      ORDER BY
        a.Anio DESC,
        c.Nombres,
        c.Apellido1, c.Apellido2,
        da.ColaboradorId;
    `);

  return result.recordset ?? [];
}

export async function createDetalleAguinaldo(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el detalle del aguinaldo.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("aguinaldoId", sql.Int, datos.aguinaldoId)
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("salarioAcumulado", sql.Decimal(14, 2), datos.salarioAcumulado)
    .input("montoAguinaldo", sql.Decimal(14, 2), datos.montoAguinaldo).query(`
      INSERT INTO dbo.DetallesAguinaldo (
        AguinaldoId,
        ColaboradorId,
        RestauranteId,
        SalarioAcumulado,
        MontoAguinaldo
      )
      OUTPUT
        INSERTED.DetalleAguinaldoId,
        INSERTED.AguinaldoId,
        INSERTED.ColaboradorId,
        INSERTED.RestauranteId,
        INSERTED.SalarioAcumulado,
        INSERTED.MontoAguinaldo
      VALUES (
        @aguinaldoId,
        @colaboradorId,
        @restauranteId,
        @salarioAcumulado,
        @montoAguinaldo
      );
    `);

  return result.recordset[0] ?? null;
}
