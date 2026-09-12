import { createRequest, sql } from "../config/database.js";

export async function crearBitacora(bitacora, transaction = null) {
  const request = await createRequest(transaction);

  let datosAnteriores = null;

  if (bitacora.datosAnteriores != null) {
    datosAnteriores = JSON.stringify(bitacora.datosAnteriores);
  }

  const datosNuevos = JSON.stringify(bitacora.datosNuevos);

  const result = await request
    .input("UsuarioId", sql.Int, bitacora.usuarioId)
    .input("Entidad", sql.NVarChar(50), bitacora.entidad)
    .input("RegistroId", sql.Int, bitacora.registroId)
    .input("Accion", sql.NVarChar(30), bitacora.accion)
    .input("DatosAnteriores", sql.NVarChar(sql.MAX), datosAnteriores)
    .input("DatosNuevos", sql.NVarChar(sql.MAX), datosNuevos)
    .query(`
      INSERT INTO dbo.Bitacora (
        UsuarioId,
        Entidad,
        RegistroId,
        Accion,
        DatosAnteriores,
        DatosNuevos
      )
      VALUES (
        @UsuarioId,
        @Entidad,
        @RegistroId,
        @Accion,
        @DatosAnteriores,
        @DatosNuevos
      );
    `);

  return result.rowsAffected[0] === 1;
}