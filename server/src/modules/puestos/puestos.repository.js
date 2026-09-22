import { sql, createRequest } from "../../shared/config/database.js";

export async function crearPuesto(puesto, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("Nombre", sql.NVarChar(80), puesto.nombre)
    .input("TarifaHora", sql.Decimal(12, 2), puesto.tarifaHora)
    .query(
      `INSERT INTO Puestos (Nombre, TarifaHora) VALUES (@Nombre, @TarifaHora);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS PuestoId;`,
    );
  return result.recordset?.[0]?.PuestoId ?? null;
}

export async function getPuestos(incluirInactivos = false){
    const request = await createRequest();
    const result = await request.query(incluirInactivos ? "SELECT * FROM Puestos" : "SELECT * FROM Puestos WHERE Activo = 1");
    return result.recordset || [];
}

export async function updateTarifaPuesto(id, tarifaHora, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .input("TarifaHora", sql.Decimal(12, 2), tarifaHora)
    .query(
      "UPDATE Puestos SET TarifaHora = @TarifaHora WHERE PuestoId = @id AND Activo = 1",
    );
  return result.rowsAffected[0] > 0;
}

export async function getPuestoById(id, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("id", sql.Int, id)
    .query(`SELECT * FROM Puestos${transaction ? " WITH (UPDLOCK, HOLDLOCK)" : ""} WHERE PuestoId = @id`);
  return result.recordset[0] || null;
}

export async function actualizarEstadoPuesto(id, activo, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("id", sql.Int, id)
    .input("activo", sql.Bit, activo)
    .query("UPDATE Puestos SET Activo = @activo WHERE PuestoId = @id");
  return result.rowsAffected[0] > 0;
}
