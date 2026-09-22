import { sql, createRequest } from "../../shared/config/database.js";

export async function getProvincias() {
  const request = await createRequest();
  const result = await request.query("SELECT * FROM Provincias");
  return result.recordset || [];
}

export async function getCantones(idProvincia) {
  const request = await createRequest();
  const result = await request
    .input("idProvincia", sql.Int, idProvincia)
    .query("SELECT * FROM Cantones WHERE ProvinciaId = @idProvincia");
  return result.recordset || [];
}

export async function getDistritos(idCanton) {
  const request = await createRequest();
  const result = await request
    .input("idCanton", sql.Int, idCanton)
    .query("SELECT * FROM Distritos WHERE CantonId = @idCanton");
  return result.recordset || [];
}

export async function getProvinciaById(id) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .query("SELECT * FROM Provincias WHERE ProvinciaId = @id");
  return result.recordset[0] || null;
}

export async function getCantonById(id) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .query("SELECT * FROM Cantones WHERE CantonId = @id");
  return result.recordset[0] || null;
}

export async function getDistritoById(id) {
  const request = await createRequest();
  const result = await request.input("id", sql.Int, id)
    .query("SELECT * FROM Distritos WHERE DistritoId = @id");
  return result.recordset[0] || null;
}
