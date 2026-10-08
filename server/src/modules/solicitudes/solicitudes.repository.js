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
