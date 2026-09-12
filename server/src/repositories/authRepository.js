import { sql, getConnection, createRequest } from "../config/database.js";

export async function getUsers() {
  const request = await createRequest();
  const result = await request.query("SELECT * FROM Usuarios WHERE Activo = 1");
  return result.recordset || [];
}

export async function getUserById(id) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.Int, id)
    .query("SELECT * FROM Usuarios WHERE UsuarioId = @id AND Activo = 1");
  return result.recordset[0] || null;
}

export async function getUserByUsername(username, includeInactive = false) {
  const request = await createRequest();
  const result = await request
    .input("username", sql.NVarChar(60), username)
    .input("includeInactive", sql.Bit, includeInactive)
    .query("SELECT * FROM Usuarios WHERE NombreUsuario = @username AND (Activo = 1 OR @includeInactive = 1)");
  return result.recordset[0] || null;
}

export async function createUser(user, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("NombreUsuario", sql.NVarChar(60), user.nombreUsuario)
    .input("PasswordHash", sql.VarChar(255), user.passwordHash)
    .input("RolId", sql.Int, user.rolId)
    .input("ColaboradorId", sql.Int, user.colaboradorId).query(`
        INSERT INTO Usuarios (NombreUsuario, PasswordHash, RolId, ColaboradorId) 
        VALUES (@NombreUsuario, @PasswordHash, @RolId, @ColaboradorId); 
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS UsuarioId;`);

  return result.recordset[0].UsuarioId;
}

export async function updatePassword(id, passwordHash, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .input("PasswordHash", sql.VarChar(255), passwordHash)
    .query(
      "UPDATE Usuarios SET PasswordHash = @PasswordHash WHERE UsuarioId = @id AND Activo = 1",
    );

  return result.rowsAffected[0] > 0;
}

export async function getUserByColaboradorId(colaboradorId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query("SELECT * FROM Usuarios WHERE ColaboradorId = @colaboradorId");
  return result.recordset[0] || null;
}
