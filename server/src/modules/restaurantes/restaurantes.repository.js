import { sql, createRequest } from "../../shared/config/database.js";

export async function getRestaurantes(incluirInactivos = false) {
  const request = await createRequest();
  const result = await request.query(`
    SELECT r.*, d.Nombre AS NombreDistrito
    FROM Restaurantes AS r
    LEFT JOIN Distritos AS d ON d.DistritoId = r.DistritoId
    ${incluirInactivos ? "" : "WHERE r.Activo = 1"}
  `);
  return result.recordset || [];
}

export async function getRestauranteById(id, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .query(
      `SELECT * FROM Restaurantes${transaction ? " WITH (UPDLOCK, HOLDLOCK)" : ""} WHERE RestauranteId = @id`,
    );
  return result.recordset[0] || null;
}

export async function createRestaurante(restaurante, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("nombre", sql.NVarChar(100), restaurante.nombre)
    .input("distritoId", sql.Int, restaurante.distritoId)
    .input("detalleDireccion", sql.NVarChar(300), restaurante.detalleDireccion)
    .query(
      `INSERT INTO Restaurantes (Nombre, DistritoId, DetalleDireccion) VALUES (@nombre, @distritoId, @detalleDireccion);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS RestauranteId;`,
    );
  return result.recordset?.[0]?.RestauranteId ?? null;
}

export async function updateRestaurante(id, restaurante, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .input("nombre", sql.NVarChar(100), restaurante.nombre)
    .input("distritoId", sql.Int, restaurante.distritoId)
    .input("detalleDireccion", sql.NVarChar(300), restaurante.detalleDireccion)
    .query(
      "UPDATE Restaurantes SET Nombre = @nombre, DistritoId = @distritoId, DetalleDireccion = @detalleDireccion WHERE RestauranteId = @id AND Activo = 1",
    );
  return result.rowsAffected[0] > 0;
}

export async function desactivarRestaurante(id, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .query(
      "UPDATE Restaurantes SET Activo = 0 WHERE RestauranteId = @id AND Activo = 1",
    );
  return result.rowsAffected[0] > 0;
}

export async function actualizarEstadoRestaurante(id, activo, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("id", sql.Int, id)
    .input("activo", sql.Bit, activo)
    .query("UPDATE Restaurantes SET Activo = @activo WHERE RestauranteId = @id");
  return result.rowsAffected[0] > 0;
}
