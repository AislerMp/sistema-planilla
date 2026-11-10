import { createRequest, sql } from "../../shared/config/database.js";
import { serviceError } from "../../shared/utils/serviceUtils.js";

export async function getLiquidacionById(liquidacionId, transaction = null) {
  const request = await createRequest(transaction);

  const result = await request.input("liquidacionId", sql.Int, liquidacionId)
    .query(`
        SELECT 
          L.LiquidacionId, L.ColaboradorId, L.RestauranteId, L.DetallePlanillaId, L.MotivoSalida,
          L.FechaSalida, L.DiasVacacionesPagados, L.DiasPreavisoPagados, L.DiasCesantiaPagados, L.MontoVacaciones,
          L.MontoAguinaldo, L.MontoPreaviso, L.MontoCesantia, L.TotalLiquidacion, L.RegistradoPorUsuarioId, L.Observacion,
          C.Nombres as ColaboradorNombre, C.Apellido1 AS ColaboradorApellido1, C.Apellido2 AS ColaboradorApellido2, C.Identificacion, C.FechaIngreso,
          C.FechaSalida AS FechaSalidaColaborador,
          R.Nombre as RestauranteNombre, U.NombreUsuario AS RegistradoPorNombre
        FROM dbo.Liquidaciones as L
        JOIN dbo.Colaboradores as C ON L.ColaboradorId = C.ColaboradorId
        JOIN dbo.Restaurantes as R ON L.RestauranteId = R.RestauranteId
        LEFT JOIN dbo.Usuarios AS U ON U.UsuarioId = L.RegistradoPorUsuarioId
        WHERE L.LiquidacionId = @liquidacionId`);

  return result.recordset[0] ?? null;
}

export async function getLiquidacionByColaborador(
  colaboradorId,
  transaction = null,
) {
  const request = await createRequest(transaction);

  const result = await request.input("colaboradorId", sql.Int, colaboradorId)
    .query(`
        SELECT 
          L.LiquidacionId, L.ColaboradorId, L.RestauranteId, L.DetallePlanillaId, L.MotivoSalida,
          L.FechaSalida, L.DiasVacacionesPagados, L.DiasPreavisoPagados, L.DiasCesantiaPagados, L.MontoVacaciones,
          L.MontoAguinaldo, L.MontoPreaviso, L.MontoCesantia, L.TotalLiquidacion, L.RegistradoPorUsuarioId, L.Observacion,
          C.Nombres as ColaboradorNombre, C.Apellido1 AS ColaboradorApellido1, C.Apellido2 AS ColaboradorApellido2, C.Identificacion, C.FechaIngreso,
          C.FechaSalida AS FechaSalidaColaborador,
          R.Nombre as RestauranteNombre, U.NombreUsuario AS RegistradoPorNombre
        FROM dbo.Liquidaciones as L
        JOIN dbo.Colaboradores as C ON L.ColaboradorId = C.ColaboradorId
        JOIN dbo.Restaurantes as R ON L.RestauranteId = R.RestauranteId
        LEFT JOIN dbo.Usuarios AS U ON U.UsuarioId = L.RegistradoPorUsuarioId
        WHERE L.ColaboradorId = @colaboradorId
        ORDER BY L.FechaSalida DESC, L.LiquidacionId DESC`);

  return result.recordset[0] ?? null;
}

export async function getLiquidacionesByRestaurante(
  restauranteId = null,
  filtros = {},
  transaction = null,
) {
  const request = await createRequest(transaction);

  const { desde, hasta, motivoSalida } = filtros;

  const result = await request
    .input("restauranteId", sql.Int, restauranteId)
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta)
    .input("motivoSalida", sql.VarChar, motivoSalida).query(`
        SELECT 
          L.LiquidacionId, L.ColaboradorId, L.RestauranteId, L.DetallePlanillaId, L.MotivoSalida,
          L.FechaSalida, L.DiasVacacionesPagados, L.DiasPreavisoPagados, L.DiasCesantiaPagados, L.MontoVacaciones,
          L.MontoAguinaldo, L.MontoPreaviso, L.MontoCesantia, L.TotalLiquidacion, L.RegistradoPorUsuarioId, L.Observacion,
          C.Nombres as ColaboradorNombre, C.Apellido1 AS ColaboradorApellido1, C.Apellido2 AS ColaboradorApellido2, C.Identificacion, C.FechaIngreso,
          C.FechaSalida AS FechaSalidaColaborador,
          R.Nombre as RestauranteNombre, U.NombreUsuario AS RegistradoPorNombre
        FROM dbo.Liquidaciones as L
        JOIN dbo.Colaboradores as C ON L.ColaboradorId = C.ColaboradorId
        JOIN dbo.Restaurantes as R ON L.RestauranteId = R.RestauranteId
        LEFT JOIN dbo.Usuarios AS U ON U.UsuarioId = L.RegistradoPorUsuarioId
        WHERE (@restauranteId IS NULL OR L.RestauranteId = @restauranteId)
          AND (@desde IS NULL OR L.FechaSalida >= @desde)
          AND (@hasta IS NULL OR L.FechaSalida <= @hasta)
          AND (@motivoSalida IS NULL OR L.MotivoSalida = @motivoSalida)
        ORDER BY L.FechaSalida DESC, L.LiquidacionId DESC`);

  return result.recordset ?? [];
}

export async function createLiquidacion(datos, transaction) {
  /*{
  colaboradorId,
  restauranteId,
  motivoSalida,
  fechaSalida,

  diasVacacionesPagados,
  diasPreavisoPagados,
  diasCesantiaPagados,

  montoVacaciones,
  montoAguinaldo,
  montoPreaviso,
  montoCesantia,

  registradoPorUsuarioId,
  observacion,
} */

  const request = await createRequest(transaction);

  const result = await request
    .input("colaboradorId", sql.Int, datos.colaboradorId)
    .input("restauranteId", sql.Int, datos.restauranteId)
    .input("motivoSalida", sql.VarChar, datos.motivoSalida)
    .input("fechaSalida", sql.Date, datos.fechaSalida)
    .input("diasVacacionesPagados", sql.Int, datos.diasVacacionesPagados)
    .input("diasPreavisoPagados", sql.Int, datos.diasPreavisoPagados)
    .input("diasCesantiaPagados", sql.Int, datos.diasCesantiaPagados)
    .input("montoVacaciones", sql.Decimal, datos.montoVacaciones)
    .input("montoAguinaldo", sql.Decimal, datos.montoAguinaldo)
    .input("montoPreaviso", sql.Decimal, datos.montoPreaviso)
    .input("montoCesantia", sql.Decimal, datos.montoCesantia)
    .input("registradoPorUsuarioId", sql.Int, datos.registradoPorUsuarioId)
    .input("observacion", sql.VarChar, datos.observacion).query(`
      INSERT INTO dbo.Liquidaciones (
        ColaboradorId, RestauranteId, MotivoSalida, FechaSalida,
        DiasVacacionesPagados, DiasPreavisoPagados, DiasCesantiaPagados,
        MontoVacaciones, MontoAguinaldo, MontoPreaviso, MontoCesantia,
        RegistradoPorUsuarioId, Observacion
      ) 
        OUTPUT INSERTED.*
        VALUES (
        @colaboradorId, @restauranteId, @motivoSalida, @fechaSalida,
        @diasVacacionesPagados, @diasPreavisoPagados, @diasCesantiaPagados,
        @montoVacaciones, @montoAguinaldo, @montoPreaviso, @montoCesantia,
        @registradoPorUsuarioId, @observacion
      );
    `);

  return result.recordset[0];
}

export async function vincularDetallePlanilla(
  liquidacionId,
  detallePlanillaId,
  transaction,
) {
  const request = await createRequest(transaction);

  const result = await request
    .input("liquidacionId", sql.Int, liquidacionId)
    .input("detallePlanillaId", sql.Int, detallePlanillaId).query(`
      UPDATE dbo.Liquidaciones
      SET DetallePlanillaId = @detallePlanillaId
      OUTPUT INSERTED.*
      WHERE LiquidacionId = @liquidacionId
        AND DetallePlanillaId IS NULL;
    `);

  return result.recordset[0] ?? null;
}
