import { getConnection, createRequest } from "../config/database.js";

export async function getAllColaboradores() {
  const request = await createRequest();
  const result = await request.query("SELECT * FROM Colaboradores");
  return result.recordset;
}