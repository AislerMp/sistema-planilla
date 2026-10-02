import { createRequest, sql } from "../../shared/config/database.js";

// El servicio debe validar los filtros. Desde/hasta son instantes UTC;
// hasta es exclusivo para incluir correctamente el último día seleccionado.
export async function getBitacoras({
  pagina = 1, desde, hasta, usuarioId, entidad, registroId, accion,
} = {}) {
  const porPagina = 50;
  const request = await createRequest();
  const condiciones = `
    WHERE (@desde IS NULL OR b.FechaEvento >= @desde)
      AND (@hasta IS NULL OR b.FechaEvento < @hasta)
      AND (@usuarioId IS NULL OR b.UsuarioId = @usuarioId)
      AND (@entidad IS NULL OR b.Entidad = @entidad)
      AND (@registroId IS NULL OR b.RegistroId = @registroId)
      AND (@accion IS NULL OR b.Accion = @accion)
  `;

  const result = await request
    .input("desde", sql.DateTime2, desde ?? null)
    .input("hasta", sql.DateTime2, hasta ?? null)
    .input("usuarioId", sql.Int, usuarioId ?? null)
    .input("entidad", sql.NVarChar(50), entidad ?? null)
    .input("registroId", sql.Int, registroId ?? null)
    .input("accion", sql.NVarChar(30), accion ?? null)
    .input("offset", sql.BigInt, (pagina - 1) * porPagina)
    .input("porPagina", sql.Int, porPagina)
    .query(`
      SELECT COUNT_BIG(*) AS Total
      FROM dbo.Bitacora AS b
      ${condiciones};

      SELECT b.BitacoraId, b.FechaEvento, b.UsuarioId, u.NombreUsuario,
             b.Entidad, b.RegistroId, b.Accion
      FROM dbo.Bitacora AS b
      LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = b.UsuarioId
      ${condiciones}
      ORDER BY b.BitacoraId DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `);

  const total = Number(result.recordsets[0][0].Total);
  return {
    registros: result.recordsets[1],
    pagina,
    porPagina,
    total,
    totalPaginas: Math.ceil(total / porPagina),
  };
}

export async function getBitacoraById(id) {
  const request = await createRequest();
  const result = await request
    .input("id", sql.BigInt, id)
    .query(`
      SELECT b.BitacoraId, b.FechaEvento, b.UsuarioId, u.NombreUsuario,
             b.Entidad, b.RegistroId, b.Accion,
             b.DatosAnteriores, b.DatosNuevos
      FROM dbo.Bitacora AS b
      LEFT JOIN dbo.Usuarios AS u ON u.UsuarioId = b.UsuarioId
      WHERE b.BitacoraId = @id;
    `);
  return result.recordset[0] ?? null;
}

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
