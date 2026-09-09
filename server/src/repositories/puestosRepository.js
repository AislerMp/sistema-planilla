import { sql, createRequest } from "../config/database.js";

export async function crearPuesto(puesto) {
  const request = await createRequest();
  const result = await request
    .input("Nombre", sql.NVarChar(80), puesto.nombre)
    .input("TarifaHora", sql.Decimal(12, 2), puesto.tarifaHora)
    .query(
      "INSERT INTO Puestos (Nombre, TarifaHora) VALUES (@Nombre, @TarifaHora)",
    );
  return result.rowsAffected[0] > 0;
}

export async function getPuestos(){
    const request = await createRequest();
    const result = await request.query("SELECT * FROM Puestos WHERE Activo = 1");
    return result.recordset || [];
}

export async function updateTarifaPuesto(id, tarifaHora) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.Int, id)
    .input("TarifaHora", sql.Decimal(12, 2), tarifaHora)
    .query(
      "UPDATE Puestos SET TarifaHora = @TarifaHora WHERE PuestoId = @id AND Activo = 1",
    );
  return result.rowsAffected[0] > 0;
}

export async function getPuestoById(id) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .query("SELECT * FROM Puestos WHERE PuestoId = @id");
  return result.recordset[0] || null;
}

export async function togglePuestoActivo(id, activo) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .input("activo", sql.Bit, activo)
    .query("UPDATE Puestos SET Activo = @activo WHERE PuestoId = @id");
  return result.rowsAffected[0] > 0;
}
