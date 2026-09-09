import {
  createRequest,
  closeConnection,
} from "../src/config/database.js";

try {
  const request = await createRequest();

  const result = await request.query(`
    SELECT
      DB_NAME() AS databaseName,
      1 AS connectionOk;
  `);

  console.log("Conexión con SQL Server exitosa:");
  console.log(result.recordsets)
  console.table(result.recordset);
} catch (error) {
  console.error("No fue posible conectar con SQL Server.");
  console.error(error.message);

  process.exitCode = 1;
} finally {
  try {
    await closeConnection();
  } catch (error) {
    console.error("No fue posible cerrar el pool:");
    console.error(error.message);

    process.exitCode = 1;
  }
}