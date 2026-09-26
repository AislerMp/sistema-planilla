import { createRequest, sql } from "../../shared/config/database.js";

export async function getMarcaById(marcaId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("marcaId", sql.Int, marcaId).query(`
      SELECT
        MarcaId,
        ColaboradorId,
        FechaAsignada,
        NumeroIntervalo,
        FechaHoraEntrada,
        FechaHoraSalida
      FROM dbo.MarcasAsistencia
      WHERE MarcaId = @marcaId;
    `);

  return result.recordset[0] ?? null;
}

export async function getMarcasByFechaAndColaborador(
  fechaAsignada,
  colaboradorId,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fechaAsignada", sql.Date, fechaAsignada).query(`
      SELECT
        MarcaId,
        ColaboradorId,
        FechaAsignada,
        NumeroIntervalo,
        FechaHoraEntrada,
        FechaHoraSalida
      FROM dbo.MarcasAsistencia
      WHERE ColaboradorId = @colaboradorId
        AND FechaAsignada = @fechaAsignada
      ORDER BY NumeroIntervalo ASC;
    `);

  return result.recordset;
}

export async function getLastMarca(colaboradorId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query(`
      SELECT TOP (1)
        MarcaId,
        ColaboradorId,
        FechaAsignada,
        NumeroIntervalo,
        FechaHoraEntrada,
        FechaHoraSalida
      FROM dbo.MarcasAsistencia
      WHERE ColaboradorId = @colaboradorId
      ORDER BY FechaAsignada DESC, NumeroIntervalo DESC;
    `);

  return result.recordset[0] ?? null;
}

// Buscar el intervalo cuya salida todavía está pendiente.
export async function getIntervaloPendiente(
  colaboradorId,
  fechaAsignada,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("fechaAsignada", sql.Date, fechaAsignada).query(`
      SELECT
        MarcaId,
        ColaboradorId,
        FechaAsignada,
        NumeroIntervalo,
        FechaHoraEntrada,
        FechaHoraSalida
      FROM dbo.MarcasAsistencia
      WHERE ColaboradorId = @colaboradorId
        AND FechaAsignada = @fechaAsignada
        AND FechaHoraSalida IS NULL;
    `);

  return result.recordset[0] ?? null;
}

export async function createMarcaEntrada(datos, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("fechaAsignada", sql.Date, datos.fechaAsignada)
    .input("numeroIntervalo", sql.TinyInt, datos.numeroIntervalo)
    .input("fechaHoraEntrada", sql.DateTime2(0), datos.fechaHoraEntrada).query(`
      INSERT INTO dbo.MarcasAsistencia (
        ColaboradorId,
        FechaAsignada,
        NumeroIntervalo,
        FechaHoraEntrada
      )
      OUTPUT
        INSERTED.MarcaId,
        INSERTED.ColaboradorId,
        INSERTED.FechaAsignada,
        INSERTED.NumeroIntervalo,
        INSERTED.FechaHoraEntrada,
        INSERTED.FechaHoraSalida
      VALUES (
        @colaboradorId,
        @fechaAsignada,
        @numeroIntervalo,
        @fechaHoraEntrada
      );
    `);

  return result.recordset[0] ?? null;
}

export async function marcarSalida(
  marcaId,
  fechaHoraSalida,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("marcaId", sql.Int, marcaId)
    .input("fechaHoraSalida", sql.DateTime2(0), fechaHoraSalida).query(`
      UPDATE dbo.MarcasAsistencia
      SET FechaHoraSalida = @fechaHoraSalida
      OUTPUT
        INSERTED.MarcaId,
        INSERTED.ColaboradorId,
        INSERTED.FechaAsignada,
        INSERTED.NumeroIntervalo,
        INSERTED.FechaHoraEntrada,
        INSERTED.FechaHoraSalida
      WHERE MarcaId = @marcaId
        AND FechaHoraSalida IS NULL;
    `);

  return result.recordset[0] ?? null;
}
