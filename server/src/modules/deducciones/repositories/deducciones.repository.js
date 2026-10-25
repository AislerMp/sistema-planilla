import { createRequest, sql } from "../../../shared/config/database.js";
import { serviceError } from "../../../shared/utils/serviceUtils.js";

export async function getDeducciones(
  filtros = {},
  transaction = null,
) {
  const { tipoDeduccion, codigo, fechaVigencia } = filtros;

  const request = await createRequest(transaction);

  const result = await request
    .input("tipoDeduccion", sql.VarChar(15), tipoDeduccion ?? null)
    .input("codigo", sql.VarChar(50), codigo ?? null)
    .input("fechaVigencia", sql.Date, fechaVigencia ?? null)
    .query(`
      SELECT
        DeduccionId,
        Nombre,
        Codigo,
        TipoDeduccion,
        Porcentaje,
        FechaVigenciaInicio,
        FechaVigenciaFin,
        EntidadReceptora
      FROM dbo.Deducciones
      WHERE (@tipoDeduccion IS NULL OR TipoDeduccion = @tipoDeduccion)
        AND (@codigo IS NULL OR Codigo = @codigo)
        AND (
          @fechaVigencia IS NULL
          OR (
            FechaVigenciaInicio <= @fechaVigencia
            AND (
              FechaVigenciaFin IS NULL
              OR FechaVigenciaFin >= @fechaVigencia
            )
          )
        )
      ORDER BY Nombre, FechaVigenciaInicio DESC, DeduccionId DESC;
    `);

  return result.recordset;
}

export async function getTiposCodigos(transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.query(`
    SELECT DISTINCT TipoDeduccion, Codigo
    FROM dbo.Deducciones;
  `);

  return result.recordset;
}

export async function existeNombreOCodigo(
  nombre,
  codigo,
  transaction = null,
) {
  const request = await createRequest(transaction);
  const result = await request
    .input("nombre", sql.VarChar(100), nombre)
    .input("codigo", sql.VarChar(50), codigo).query(`
      SELECT TOP (1)
        CASE WHEN Codigo = @codigo THEN 1 ELSE 0 END AS CodigoDuplicado,
        CASE WHEN Nombre = @nombre THEN 1 ELSE 0 END AS NombreDuplicado
      FROM dbo.Deducciones ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE Codigo = @codigo OR Nombre = @nombre
      ORDER BY CASE WHEN Codigo = @codigo THEN 0 ELSE 1 END;
    `);

  return result.recordset[0] ?? null;
}

export async function getDeduccionById(deduccionId, transaction = null) {
  const request = await createRequest(transaction);
  const result = await request.input("deduccionId", sql.Int, deduccionId)
    .query(`
        SELECT
            DeduccionId,
            Nombre,
            Codigo,
            TipoDeduccion,
            Porcentaje,
            FechaVigenciaInicio,
            FechaVigenciaFin,
            EntidadReceptora
        FROM dbo.Deducciones ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
        WHERE DeduccionId = @deduccionId;
      `);

  return result.recordset[0] ?? null;
}

// excluirDeduccionId evita comparar un registro consigo mismo
// cuando modificamos su fecha final.
export async function existeVigenciaSuperpuesta(
  codigo,
  fechaInicio,
  fechaFin,
  transaction = null,
  excluirDeduccionId = null,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("codigo", sql.VarChar(50), codigo)
    .input("fechaInicio", sql.Date, fechaInicio)
    .input("fechaFin", sql.Date, fechaFin ?? null)
    .input("excluirDeduccionId", sql.Int, excluirDeduccionId).query(`
      SELECT TOP (1)
        DeduccionId
      FROM dbo.Deducciones ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
      WHERE Codigo = @codigo
        AND (
          @excluirDeduccionId IS NULL
          OR DeduccionId <> @excluirDeduccionId
        )
        AND (
          @fechaFin IS NULL
          OR FechaVigenciaInicio <= @fechaFin
        )
        AND (
          FechaVigenciaFin IS NULL
          OR FechaVigenciaFin >= @fechaInicio
        );
    `);

  return result.recordset.length > 0;
}

export async function createDeduccion(datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para crear la deducción.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("nombre", sql.NVarChar(100), datos.nombre)
    .input("codigo", sql.VarChar(50), datos.codigo)
    .input("tipoDeduccion", sql.VarChar(15), datos.tipoDeduccion)
    .input("porcentaje", sql.Decimal(5, 2), datos.porcentaje ?? null)
    .input("fechaInicio", sql.Date, datos.fechaVigenciaInicio)
    .input("fechaFin", sql.Date, datos.fechaVigenciaFin ?? null)
    .input(
      "entidadReceptora",
      sql.NVarChar(100),
      datos.entidadReceptora ?? null,
    ).query(`
      INSERT INTO dbo.Deducciones (
        Nombre,
        Codigo,
        TipoDeduccion,
        Porcentaje,
        FechaVigenciaInicio,
        FechaVigenciaFin,
        EntidadReceptora
      )
      OUTPUT
        INSERTED.DeduccionId,
        INSERTED.Nombre,
        INSERTED.Codigo,
        INSERTED.TipoDeduccion,
        INSERTED.Porcentaje,
        INSERTED.FechaVigenciaInicio,
        INSERTED.FechaVigenciaFin,
        INSERTED.EntidadReceptora
      VALUES (
        @nombre,
        @codigo,
        @tipoDeduccion,
        @porcentaje,
        @fechaInicio,
        @fechaFin,
        @entidadReceptora
      );
    `);

  return result.recordset[0] ?? null;
}

// Recibe nombre y entidadReceptora completos, validados por el service.
// Un cambio de porcentaje se guarda creando otra versión.
export async function updateDatosDeduccion(deduccionId, datos, transaction) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar la deducción.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("deduccionId", sql.Int, deduccionId)
    .input("nombre", sql.NVarChar(100), datos.nombre)
    .input(
      "entidadReceptora",
      sql.NVarChar(100),
      datos.entidadReceptora ?? null,
    ).query(`
        UPDATE dbo.Deducciones
        SET
          Nombre = @nombre,
          EntidadReceptora = @entidadReceptora
        OUTPUT
          INSERTED.DeduccionId,
          INSERTED.Nombre,
          INSERTED.Codigo,
          INSERTED.TipoDeduccion,
          INSERTED.Porcentaje,
          INSERTED.FechaVigenciaInicio,
          INSERTED.FechaVigenciaFin,
          INSERTED.EntidadReceptora
        WHERE DeduccionId = @deduccionId;
      `);

  return result.recordset[0] ?? null;
}

// Basicamente es desactivar la deduccion
export async function updateFechaFinDeduccion(
  deduccionId,
  fechaFin,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para actualizar la deducción.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("deduccionId", sql.Int, deduccionId)
    .input("fechaFin", sql.Date, fechaFin).query(`
    UPDATE dbo.Deducciones
    SET FechaVigenciaFin = @fechaFin
    OUTPUT
      INSERTED.DeduccionId,
      INSERTED.Nombre,
      INSERTED.Codigo,
      INSERTED.TipoDeduccion,
      INSERTED.Porcentaje,
      INSERTED.FechaVigenciaInicio,
      INSERTED.FechaVigenciaFin,
      INSERTED.EntidadReceptora
    WHERE DeduccionId = @deduccionId;
      `);

  return result.recordset[0] ?? null;
}
