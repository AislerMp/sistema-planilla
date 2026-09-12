import { createRequest, sql } from "../config/database.js";

export async function getAllColaboradores() {
  const request = await createRequest();
  const result = await request.query("SELECT * FROM Colaboradores WHERE Activo = 1");
  return result.recordset || [];
}

export async function getColaboradorById(id, transaction=null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .query("SELECT * FROM Colaboradores WHERE ColaboradorId = @id");
  return result.recordset[0] || null;
}

export async function createColaborador(colaborador, transaction=null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("Identificacion", sql.NVarChar(30), colaborador.identificacion)
    .input("Correo", sql.NVarChar(100), colaborador.correo)
    .input("Nombres", sql.NVarChar(100), colaborador.nombre)
    .input("Apellidos", sql.NVarChar(100), colaborador.apellido)
    .input("FechaIngreso", sql.Date, colaborador.fechaIngreso)
    .input("FechaSalida", sql.Date, colaborador.fechaSalida ?? null)
    .input("RestauranteId", sql.Int, colaborador.restauranteId)
    .input("PuestoId", sql.Int, colaborador.puestoId)
    .input("DistritoId", sql.Int, colaborador?.distritoId)
    .input("DetalleDireccion", sql.NVarChar(300), colaborador.detalleDireccion)
    .query(
      `INSERT INTO Colaboradores (Identificacion, Correo, Nombres, Apellidos, FechaIngreso, FechaSalida, RestauranteId, PuestoId, DistritoId, DetalleDireccion)
       VALUES (@Identificacion, @Correo, @Nombres, @Apellidos, @FechaIngreso, @FechaSalida, @RestauranteId, @PuestoId, @DistritoId, @DetalleDireccion);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS ColaboradorId;
       `,
    );
  return result.recordset[0].ColaboradorId;
}

export async function updateColaborador(id, colaborador, transaction=null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .input("Identificacion", sql.NVarChar(30), colaborador.identificacion)
    .input("Correo", sql.NVarChar(100), colaborador.correo)
    .input("Nombres", sql.NVarChar(100), colaborador.nombre)
    .input("Apellidos", sql.NVarChar(100), colaborador.apellido)
    .input("FechaIngreso", sql.Date, colaborador.fechaIngreso)
    .input("FechaSalida", sql.Date, colaborador.fechaSalida ?? null)
    .input("RestauranteId", sql.Int, colaborador.restauranteId)
    .input("PuestoId", sql.Int, colaborador.puestoId)
    .input("DistritoId", sql.Int, colaborador?.distritoId)
    .input("DetalleDireccion", sql.NVarChar(300), colaborador.detalleDireccion)
    .query(
      `UPDATE Colaboradores
       SET Identificacion = @Identificacion,
           Correo = @Correo,
           Nombres = @Nombres,
           Apellidos = @Apellidos,
           FechaIngreso = @FechaIngreso,
           FechaSalida = @FechaSalida,
           RestauranteId = @RestauranteId,
           PuestoId = @PuestoId,
           DistritoId = @DistritoId,
           DetalleDireccion = @DetalleDireccion
       WHERE ColaboradorId = @id;
       `,
    );
  return result.rowsAffected[0] > 0;
}

export async function toggleColaboradorActivo(id, activo, transaction=null) {
  const request = await createRequest(transaction);
  const result = await request
    .input("id", sql.Int, id)
    .input("activo", sql.Bit, activo)
    .query("UPDATE Colaboradores SET Activo = @activo WHERE ColaboradorId = @id");
  return result.rowsAffected[0] > 0;
}
