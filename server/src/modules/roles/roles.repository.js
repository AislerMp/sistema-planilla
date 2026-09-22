import { sql, createRequest } from "../../shared/config/database.js";


export async function getRoles() {
  const request = await createRequest();
  const result = await request.query("SELECT * FROM Roles");
  return result.recordset || [];
}

export async function getRolById(id) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.Int, id)
    .query("SELECT * FROM Roles WHERE RolId = @id");
  return result.recordset[0] || null;
}
