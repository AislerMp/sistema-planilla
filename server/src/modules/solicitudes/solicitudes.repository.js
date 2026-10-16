import { createRequest, sql } from "../../shared/config/database.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

// Todas las creaciones toman el mismo bloqueo antes de buscar duplicados.
// El bloqueo sobre una fila existente protege incluso si no hay solicitudes aún.
export async function bloquearColaboradorSolicitudes(
  colaboradorId,
  transaction,
) {
  if (!transaction)
    throw serviceError(
      "Se requiere una transacción para crear solicitudes",
      500,
    );
  const request = await createRequest(transaction);
  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query(`
    SELECT ColaboradorId
    FROM dbo.Colaboradores WITH (UPDLOCK, HOLDLOCK)
    WHERE ColaboradorId = @colaboradorId;
  `);
  if (!result.recordset[0])
    throw serviceError("Colaborador no encontrado", 404);
}

export async function crearCabeceraSolicitud(
  datos,
  tipoSolicitud,
  transaction,
) {
  if (!transaction)
    throw serviceError(
      "Se requiere una transacción para crear solicitudes",
      500,
    );
  const request = await createRequest(transaction);
  const result = await request
    .input("tipoSolicitud", sql.VarChar(20), tipoSolicitud)
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("registradoPorUsuarioId", sql.Int, datos.registradoPorUsuarioId)
    .input("motivo", sql.NVarChar(500), datos.motivo).query(`
      INSERT INTO dbo.Solicitudes (
        TipoSolicitud, ColaboradorId, RestauranteId, RegistradoPorUsuarioId, Motivo
      )
      OUTPUT INSERTED.SolicitudId
      VALUES (@tipoSolicitud, @colaboradorId, @restauranteId, @registradoPorUsuarioId, @motivo);
    `);
  const solicitudId = result.recordset[0]?.SolicitudId;
  if (!solicitudId)
    throw serviceError("No se pudo crear la cabecera de la solicitud", 500);
  return solicitudId;
}

export async function revisarSolicitudGerente(
  solicitudId,
  tipoSolicitud,
  datosRevision,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para revisar solicitudes.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("tipoSolicitud", sql.VarChar(20), tipoSolicitud)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .input("revisadoPorGerenteId", sql.Int, datosRevision.revisadoPorGerenteId)
    .query(`
      UPDATE dbo.Solicitudes
      SET
        Estado = @estado,
        Observacion = @observacion,
        RevisadoPorGerenteId = @revisadoPorGerenteId
      OUTPUT INSERTED.*
      WHERE SolicitudId = @solicitudId
        AND TipoSolicitud = @tipoSolicitud
        AND Estado = 'PENDIENTE';
    `);

  return result.recordset[0] ?? null;
}

export async function resolverSolicitudRh(
  solicitudId,
  tipoSolicitud,
  datosRevision,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para resolver solicitudes de Recursos Humanos.",
      500,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("tipoSolicitud", sql.VarChar(20), tipoSolicitud)
    .input("estado", sql.VarChar(20), datosRevision.estado)
    .input("observacion", sql.NVarChar(500), datosRevision.observacion ?? null)
    .input("revisadoPorRhId", sql.Int, datosRevision.revisadoPorRhId)
    .query(`
      UPDATE dbo.Solicitudes
      SET
        Estado = @estado,
        Observacion = @observacion,
        RevisadoPorRhId = @revisadoPorRhId
      OUTPUT INSERTED.*
      WHERE SolicitudId = @solicitudId
        AND TipoSolicitud = @tipoSolicitud
        AND Estado = 'EN_REVISION_RH';
    `);

  return result.recordset[0] ?? null;
}

export async function revertirSolicitud(
  solicitudId,
  tipoSolicitud,
  estadoActual,
  estadoDestino,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para revertir la solicitud.",
      500,
    );
  }

  const vuelveAPendiente =
    estadoDestino === "PENDIENTE" &&
    ["APROBADA", "RECHAZADA", "EN_REVISION_RH"].includes(estadoActual);

  const vuelveARevisionRh =
    estadoDestino === "EN_REVISION_RH" &&
    ["APROBADA", "RECHAZADA"].includes(estadoActual) &&
    ["INCAPACIDAD", "VACACIONES"].includes(tipoSolicitud);

  if (!vuelveAPendiente && !vuelveARevisionRh) {
    throw serviceError(
      "La transición indicada no permite revertir la solicitud.",
      400,
    );
  }

  const request = await createRequest(transaction);

  const result = await request
    .input("solicitudId", sql.Int, solicitudId)
    .input("tipoSolicitud", sql.VarChar(20), tipoSolicitud)
    .input("estadoActual", sql.VarChar(20), estadoActual)
    .input("estadoDestino", sql.VarChar(20), estadoDestino)
    .query(`
      UPDATE dbo.Solicitudes
      SET
        Estado = @estadoDestino,

        RevisadoPorGerenteId = CASE
          WHEN @estadoDestino = 'PENDIENTE' THEN NULL
          ELSE RevisadoPorGerenteId
        END,

        RevisadoPorRhId = NULL,
        Observacion = NULL

      OUTPUT
        INSERTED.SolicitudId,
        INSERTED.TipoSolicitud,
        INSERTED.ColaboradorId,
        INSERTED.RestauranteId,
        INSERTED.RegistradoPorUsuarioId,
        INSERTED.Estado,
        INSERTED.Motivo,
        INSERTED.RevisadoPorGerenteId,
        INSERTED.RevisadoPorRhId,
        INSERTED.Observacion

      WHERE SolicitudId = @solicitudId
        AND TipoSolicitud = @tipoSolicitud
        AND Estado = @estadoActual;
    `);

  return result.recordset[0] ?? null;
}
