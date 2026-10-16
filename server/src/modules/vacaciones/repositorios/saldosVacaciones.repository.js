import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getSaldoByColaborador(colaboradorId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query(`
      SELECT
        ColaboradorId,
        DiasAcumulados,
        DiasUtilizados,
        DiasDisponibles,
        FechaAcumuladaHasta
      FROM dbo.SaldosVacaciones
      WHERE ColaboradorId = @colaboradorId;
    `);

  return result.recordset[0] ?? null;
}

export async function createSaldo(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para crear el saldo de vacaciones.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("diasAcumulados", sql.Decimal(8, 2), datos.diasAcumulados ?? 0)
    .input("diasUtilizados", sql.Decimal(8, 2), datos.diasUtilizados ?? 0)
    .input("fechaAcumuladaHasta", sql.Date, datos.fechaAcumuladaHasta).query(`
      INSERT INTO dbo.SaldosVacaciones (
        ColaboradorId,
        DiasAcumulados,
        DiasUtilizados,
        FechaAcumuladaHasta
      )
      OUTPUT
        INSERTED.ColaboradorId,
        INSERTED.DiasAcumulados,
        INSERTED.DiasUtilizados,
        INSERTED.DiasDisponibles,
        INSERTED.FechaAcumuladaHasta
      VALUES (
        @colaboradorId,
        @diasAcumulados,
        @diasUtilizados,
        @fechaAcumuladaHasta
      );
    `);

  return result.recordset[0] ?? null;
}

export async function updateDiasUtilizados(
  colaboradorId,
  dias,
  transaction = null,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar los días utilizados de vacaciones.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("diasUtilizados", sql.Decimal(8, 2), dias).query(`
      UPDATE dbo.SaldosVacaciones
      SET DiasUtilizados = @diasUtilizados
      OUTPUT
        INSERTED.ColaboradorId,
        INSERTED.DiasAcumulados,
        INSERTED.DiasUtilizados,
        INSERTED.DiasDisponibles,
        INSERTED.FechaAcumuladaHasta
      WHERE ColaboradorId = @colaboradorId
        AND @diasUtilizados <= DiasAcumulados;
    `);

  return result.recordset[0] ?? null;
}

export async function updateDiasAcumulados(
  colaboradorId,
  dias,
  fechaAcumuladaHasta,
  transaction = null,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar los días acumulados de vacaciones.",
      500,
    );
  }

  const request = await createRequest(transaction);
  const result = await request
    .input("colaboradorId", sql.Int, colaboradorId)
    .input("diasAcumulados", sql.Decimal(8, 2), dias)
    .input("fechaAcumuladaHasta", sql.Date, fechaAcumuladaHasta).query(`
      UPDATE dbo.SaldosVacaciones
      SET
        DiasAcumulados = @diasAcumulados,
        FechaAcumuladaHasta = @fechaAcumuladaHasta
      OUTPUT
        INSERTED.ColaboradorId,
        INSERTED.DiasAcumulados,
        INSERTED.DiasUtilizados,
        INSERTED.DiasDisponibles,
        INSERTED.FechaAcumuladaHasta
      WHERE ColaboradorId = @colaboradorId
        AND @diasAcumulados >= DiasUtilizados;
    `);

  return result.recordset[0] ?? null;
}

// Colaboradores activos cuyo saldo ya fue inicializado.
export async function getColaboradoresParaAcumulacion() {
  const request = await createRequest();

  const result = await request.query(`
    SELECT
      c.ColaboradorId
    FROM dbo.Colaboradores AS c
    INNER JOIN dbo.SaldosVacaciones AS sv
      ON sv.ColaboradorId = c.ColaboradorId
    WHERE c.Activo = 1
    ORDER BY c.ColaboradorId;
  `);

  return result.recordset;
}