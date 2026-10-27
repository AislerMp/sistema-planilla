import { createRequest, sql } from "../../shared/config/database.js";

export async function getFeriadoByFecha(fecha, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("fecha", sql.Date, fecha).query(`
    SELECT FeriadoId, Fecha, Nombre
    FROM dbo.Feriados
    WHERE Fecha = @fecha;
  `);

  return result.recordset[0] ?? null;
}

export async function getFeriadosByRango(desde, hasta, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta).query(`
      SELECT FeriadoId, Fecha, Nombre
      FROM dbo.Feriados
      WHERE Fecha BETWEEN @desde AND @hasta
      ORDER BY Fecha ASC;
    `);

  return result.recordset;
}
