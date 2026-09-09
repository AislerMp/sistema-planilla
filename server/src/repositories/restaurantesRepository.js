import { sql, createRequest } from "../config/database.js";

export async function getRestaurantes() {
  const request = await createRequest();
  const result = await request.query(
    "SELECT * FROM Restaurantes WHERE Activo = 1",
  );
  return result.recordset || [];
}

export async function getRestauranteById(id) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.Int, id)
    .query(
      "SELECT * FROM Restaurantes WHERE RestauranteId = @id",
    );
  return result.recordset[0] || null;
}

export async function createRestaurante(restaurante) {
  const request = await createRequest();
  const result = await request
    .input("nombre", sql.NVarChar(100), restaurante.nombre)
    .input("distritoId", sql.Int, restaurante.distritoId)
    .input("detalleDireccion", sql.NVarChar(300), restaurante.detalleDireccion)
    .query(
      "INSERT INTO Restaurantes (Nombre, DistritoId, DetalleDireccion) VALUES (@nombre, @distritoId, @detalleDireccion);",
    );
  return result.rowsAffected[0] > 0;
}

export async function updateRestaurante(id, restaurante) {
  const request = await createRequest();
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

export async function deactivateRestaurante(id) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.Int, id)
    .query(
      "UPDATE Restaurantes SET Activo = 0 WHERE RestauranteId = @id AND Activo = 1",
    );
  return result.rowsAffected[0] > 0;
}

export async function toggleRestauranteActivo(id, activo) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .input("activo", sql.Bit, activo)
    .query("UPDATE Restaurantes SET Activo = @activo WHERE RestauranteId = @id");
  return result.rowsAffected[0] > 0;
}
