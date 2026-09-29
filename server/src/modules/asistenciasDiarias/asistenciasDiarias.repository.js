import { sql, createRequest } from "../../shared/config/database.js";

export async function getAsistenciaById(asistenciaId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("AsistenciaId", sql.Int, asistenciaId)
    .query(`
      SELECT
        AsistenciaId,
        ColaboradorId,
        RestauranteId,
        PeriodoId,
        FechaAsignada,
        MinutosCalculados,
        MinutosAjustados,
        COALESCE(
          MinutosAjustados,
          MinutosCalculados
        ) AS MinutosEfectivos,
        FechaCreacion
      FROM dbo.AsistenciasDiarias
      WHERE AsistenciaId = @AsistenciaId;
    `);

  return result.recordset[0] ?? null;
}

export async function getAsistenciaByColaboradorYFecha(
  colaboradorId,
  fechaAsignada,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("ColaboradorId", sql.Int, colaboradorId)
    .input("FechaAsignada", sql.Date, fechaAsignada).query(`
      SELECT
        AsistenciaId,
        ColaboradorId,
        RestauranteId,
        PeriodoId,
        FechaAsignada,
        MinutosCalculados,
        MinutosAjustados,
        COALESCE(
          MinutosAjustados,
          MinutosCalculados
        ) AS MinutosEfectivos,
        FechaCreacion
      FROM dbo.AsistenciasDiarias
      WHERE ColaboradorId = @ColaboradorId
        AND FechaAsignada = @FechaAsignada;
    `);

  return result.recordset[0] ?? null;
}

// Crear el resumen diario al registrar la primera entrada.
// SQL asigna MinutosCalculados = 0 y MinutosAjustados = NULL.
export async function createAsistenciaDiaria(asistencia, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request
    .input("ColaboradorId", sql.Int, asistencia.colaboradorId)
    .input("RestauranteId", sql.Int, asistencia.restauranteId)
    .input("PeriodoId", sql.Int, asistencia.periodoId)
    .input("FechaAsignada", sql.Date, asistencia.fechaAsignada).query(`
      INSERT INTO dbo.AsistenciasDiarias (
        ColaboradorId,
        RestauranteId,
        PeriodoId,
        FechaAsignada
      )
      OUTPUT INSERTED.*
      VALUES (
        @ColaboradorId,
        @RestauranteId,
        @PeriodoId,
        @FechaAsignada
      );
    `);

  return result.recordset[0];
}

export async function getAsistenciasByColaborador(
  colaboradorId,
  filtros = {},
  transaction = null,
) {
  const { desde, hasta, periodoId } = filtros;
  const request = await createRequest(transaction);

  const result = await request
    .input("ColaboradorId", sql.Int, colaboradorId)
    .input("Desde", sql.Date, desde)
    .input("Hasta", sql.Date, hasta)
    .input("PeriodoId", sql.Int, periodoId).query(`
      SELECT
        a.AsistenciaId,
        a.FechaAsignada,

        a.RestauranteId,
        r.Nombre AS Restaurante,

        a.ColaboradorId,
        c.Nombres,
        c.Apellidos,
        c.Identificacion,

        p.TarifaHora,

        a.PeriodoId,
        pp.FechaInicio AS FechaInicioPeriodo,
        pp.FechaFin AS FechaFinPeriodo,
        pp.Estado AS EstadoPeriodo,
        pp.FechaLimiteAjustes,

        COALESCE(
            a.MinutosAjustados,
            a.MinutosCalculados
        ) AS MinutosEfectivos,

        COALESCE(
            h.MinutosAjustados,
            h.MinutosDetectados,
            0
        ) AS MinutosExtras

      FROM dbo.AsistenciasDiarias AS a

      INNER JOIN dbo.Colaboradores AS c
          ON c.ColaboradorId = a.ColaboradorId

      INNER JOIN dbo.Restaurantes AS r
          ON r.RestauranteId = a.RestauranteId

      INNER JOIN dbo.Puestos AS p
          ON p.PuestoId = c.PuestoId

      INNER JOIN dbo.PeriodosPlanilla AS pp
          ON pp.PeriodoId = a.PeriodoId

      LEFT JOIN dbo.HorasExtras AS h
          ON h.AsistenciaId = a.AsistenciaId

      WHERE a.ColaboradorId = @colaboradorId
        AND (@desde IS NULL OR a.FechaAsignada >= @desde)
        AND (@hasta IS NULL OR a.FechaAsignada <= @hasta)
        AND (@periodoId IS NULL OR a.PeriodoId = @periodoId)

      ORDER BY a.FechaAsignada;
    `);

  return result.recordset ?? [];
}

export async function getAsistenciasByRestaurante(
  restauranteId,
  filtros = {},
  transaction = null,
) {
  const { desde, hasta, periodoId } = filtros;

  const request = await createRequest(transaction);

  const result = await request
    .input("RestauranteId", sql.Int, restauranteId)
    .input("Desde", sql.Date, desde)
    .input("Hasta", sql.Date, hasta)
    .input("PeriodoId", sql.Int, periodoId).query(`
      SELECT
        a.AsistenciaId,
        a.FechaAsignada,

        a.RestauranteId,
        r.Nombre AS Restaurante,

        a.ColaboradorId,
        c.Nombres,
        c.Apellidos,
        c.Identificacion,

        p.TarifaHora,

        a.PeriodoId,
        pp.FechaInicio AS FechaInicioPeriodo,
        pp.FechaFin AS FechaFinPeriodo,
        pp.Estado AS EstadoPeriodo,
        pp.FechaLimiteAjustes,

        COALESCE(
            a.MinutosAjustados,
            a.MinutosCalculados
        ) AS MinutosEfectivos,

        COALESCE(
            h.MinutosAjustados,
            h.MinutosDetectados,
            0
        ) AS MinutosExtras

      FROM dbo.AsistenciasDiarias AS a

      INNER JOIN dbo.Colaboradores AS c
          ON c.ColaboradorId = a.ColaboradorId

      INNER JOIN dbo.Restaurantes AS r
          ON r.RestauranteId = a.RestauranteId

      INNER JOIN dbo.Puestos AS p
          ON p.PuestoId = c.PuestoId

      INNER JOIN dbo.PeriodosPlanilla AS pp
          ON pp.PeriodoId = a.PeriodoId

      LEFT JOIN dbo.HorasExtras AS h
          ON h.AsistenciaId = a.AsistenciaId

      WHERE a.RestauranteId = @restauranteId
        AND (@desde IS NULL OR a.FechaAsignada >= @desde)
        AND (@hasta IS NULL OR a.FechaAsignada <= @hasta)
        AND (@periodoId IS NULL OR a.PeriodoId = @periodoId)

      ORDER BY
          c.Nombres,
          c.Apellidos,
          a.ColaboradorId,
          a.FechaAsignada;
    `);

  return result.recordset;
}

export async function updateMinutosAsistencia(
  asistenciaId,
  minutos,
  tipoMinutos,
  transaction = null,
) {
  let columna;

  if (tipoMinutos === "Calculados") {
    columna = "MinutosCalculados";
  } else if (tipoMinutos === "Ajustados") {
    columna = "MinutosAjustados";
  } else {
    throw new Error('tipoMinutos debe ser "Calculados" o "Ajustados"');
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("AsistenciaId", sql.Int, asistenciaId)
    .input("Minutos", sql.Int, minutos).query(`
      UPDATE dbo.AsistenciasDiarias
      SET ${columna} = @Minutos
      OUTPUT INSERTED.*
      WHERE AsistenciaId = @AsistenciaId;
    `);

  return result.recordset[0] ?? null;
}