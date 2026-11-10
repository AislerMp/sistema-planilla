import {
  serviceError,
  validateDate,
  validateId,
  validateText,
  validateNumber,
} from "../../shared/utils/serviceUtils.js";

import * as liquidacionesRepository from "./liquidaciones.repository.js";

import * as colaboradoresRepository from "../colaboradores/colaboradores.repository.js";

import * as saldosVacacionesRepository from "../vacaciones/repositorios/saldosVacaciones.repository.js";

import * as aguinaldoService from "../aguinaldos/aguinaldo.service.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";
import { getSalariosParaPromedio } from "../planillas/repositories/detallesPlanilla.repository.js";
import { calcularDetalleColaborador } from "../planillas/services/detallesPlanilla.service.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";

import {
  registrarBitacora,
  entidades,
  acciones,
} from "../bitacora/bitacora.service.js";

export async function getLiquidacionByIdService(liquidacionId) {
  const id = validateId(liquidacionId, "LiquidacionId");
  const liquidacion = await liquidacionesRepository.getLiquidacionById(id);
  if (!liquidacion) {
    throw serviceError(`Liquidacion with id ${id} not found`);
  }
  return liquidacion;
}

export async function getLiquidacionByColaboradorService(colaboradorId) {
  const id = validateId(colaboradorId, "ColaboradorId");
  const liquidaciones =
    await liquidacionesRepository.getLiquidacionByColaborador(id);
  if (!liquidaciones) {
    throw serviceError(`No liquidaciones found for colaborador with id ${id}`);
  }
  return liquidaciones;
}

export async function getLiquidacionesByRestauranteService(
  restauranteId,
  filtros = {},
) {
  const id = validateId(restauranteId, "RestauranteId", true);
  const desde = validateDate(filtros.desde, "Desde", true);
  let hasta = validateDate(filtros.hasta, "Hasta", true);
  const motivoSalida = validateText(
    filtros.motivoSalida,
    "MotivoSalida",
    500,
    true,
  );

  if (desde && hasta && desde > hasta) {
    throw serviceError(
      "La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'",
    );
  }

  if (
    motivoSalida &&
    ![
      "RENUNCIA",
      "DESPIDO_CON_RESPONSABILIDAD",
      "DESPIDO_SIN_RESPONSABILIDAD",
    ].includes(motivoSalida)
  ) {
    throw serviceError(
      "El motivo de salida debe ser 'RENUNCIA', 'DESPIDO_CON_RESPONSABILIDAD' o 'DESPIDO_SIN_RESPONSABILIDAD'",
    );
  }

  if (desde && !hasta) hasta = desde;

  const liquidaciones =
    await liquidacionesRepository.getLiquidacionesByRestaurante(id, {
      desde,
      hasta,
      motivoSalida,
    });

  if (!liquidaciones) {
    throw serviceError(
      `No se encontraron liquidaciones para el restaurante con id ${id}`,
    );
  }

  return liquidaciones;
}

function validateDatosSalida(datosSalida) {
  const motivoSalida = validateText(
    datosSalida.motivoSalida,
    "MotivoSalida",
    500,
    true,
  )
    .toUpperCase()
    .trim();
  const fechaSalida = validateDate(
    datosSalida.fechaSalida,
    "FechaSalida",
    true,
  );
  const diasPreavisoTrabajados = validateNumber(
    datosSalida.diasPreavisoTrabajados,
    "DiasPreavisoTrabajados",
    true,
  );
  const observacion = validateText(
    datosSalida.observacion,
    "Observacion",
    1000,
    true,
  );

  if (
    motivoSalida &&
    ![
      "RENUNCIA",
      "DESPIDO_CON_RESPONSABILIDAD", // Despido Injustificado
      "DESPIDO_SIN_RESPONSABILIDAD", // Motivo de salida válido para despido sin responsabilidad
    ].includes(motivoSalida)
  ) {
    throw serviceError(
      "El motivo de salida debe ser 'RENUNCIA', 'DESPIDO_CON_RESPONSABILIDAD' o 'DESPIDO_SIN_RESPONSABILIDAD'",
    );
  }

  return {
    motivoSalida,
    fechaSalida,
    diasPreavisoTrabajados,
    observacion,
  };
}
const FACTORES_INDEMNIZACION = [
  { hasta: 1, factor: 19.5 },
  { hasta: 2, factor: 20 },
  { hasta: 3, factor: 20.5 },
  { hasta: 4, factor: 21 },
  { hasta: 5, factor: 21.24 },
  { hasta: 6, factor: 21.5 },
  { hasta: 9, factor: 22 }, // 7, 8 o 9
  { hasta: 10, factor: 21.5 },
  { hasta: 11, factor: 21 },
  { hasta: 12, factor: 20.5 },
  { hasta: Infinity, factor: 20 }, // 13 o más
];

const DIAS_PREAVISO = {
  MENOS_DE_TRES_MESES: 0,
  TRES_A_SEIS_MESES: 7,
  SEIS_A_UN_ANO: 15,
  UN_ANO_O_MAS: 30,
};

function obtenerFactorIndemnizacion(anosCompletos) {
  if (anosCompletos < 1) return 0; // sin derecho; ajustá según tu regla
  return FACTORES_INDEMNIZACION.find((r) => anosCompletos <= r.hasta).factor;
}

function sumarMesesUTC(fecha, meses) {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() + meses;

  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();

  return new Date(Date.UTC(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia)));
}

function calcularAntiguedadMeses(fechaIngreso, fechaSalida) {
  let mesesCompletos =
    (fechaSalida.getUTCFullYear() - fechaIngreso.getUTCFullYear()) * 12 +
    fechaSalida.getUTCMonth() -
    fechaIngreso.getUTCMonth();

  let fechaUltimoMesCumplido = sumarMesesUTC(fechaIngreso, mesesCompletos);

  if (fechaSalida < fechaUltimoMesCumplido) {
    mesesCompletos -= 1;

    fechaUltimoMesCumplido = sumarMesesUTC(fechaIngreso, mesesCompletos);
  }

  const fechaSiguienteMes = sumarMesesUTC(fechaIngreso, mesesCompletos + 1);

  const fraccionMes =
    (fechaSalida - fechaUltimoMesCumplido) /
    (fechaSiguienteMes - fechaUltimoMesCumplido);

  return mesesCompletos + fraccionMes;
}

export async function calcularLiquidacion(
  usuarioActor,
  colaboradorId,
  datosSalida = {},
  transaction = null,
) {
  const datos = validateDatosSalida(datosSalida);
  const colaboradorIdValid = validateId(colaboradorId, "ColaboradorId");

  const colaborador = await colaboradoresRepository.getColaboradorById(
    colaboradorIdValid,
    transaction,
  );

  if (!colaborador) {
    throw serviceError("No se encontró el colaborador indicado.", 404);
  }

  if (!colaborador.Activo) {
    throw serviceError("El colaborador se encuentra inactivo.", 409);
  }

  const liquidacionExistente =
    await liquidacionesRepository.getLiquidacionByColaborador(
      colaboradorIdValid,
      transaction,
    );

  if (liquidacionExistente) {
    throw serviceError(
      "El colaborador ya tiene una liquidación registrada.",
      409,
    );
  }

  const fechaIngreso = new Date(colaborador.FechaIngreso);
  const fechaSalida = new Date(datos.fechaSalida);

  if (fechaSalida < fechaIngreso) {
    throw serviceError(
      "La fecha de salida no puede ser anterior a la fecha de ingreso.",
      400,
    );
  }

  const antiguedadMeses = calcularAntiguedadMeses(fechaIngreso, fechaSalida);

  // VACACIONES
  const saldoVacaciones =
    await saldosVacacionesRepository.getSaldoByColaborador(
      colaboradorIdValid,
      transaction,
    );

  if (!saldoVacaciones) {
    throw serviceError(
      "El saldo de vacaciones del colaborador no está inicializado.",
      409,
    );
  }

  const salarioXDia = Number(colaborador.TarifaHora) * 8;

  const diasVacacionesPagados = Number(saldoVacaciones.DiasDisponibles);

  const montoVacaciones = Number(
    (diasVacacionesPagados * salarioXDia).toFixed(2),
  );

  // Datos utilizados por el cálculo, para que el cliente pueda mostrar su base.
  const baseCalculo = {
    fechaIngreso: fechaSQLComoTexto(fechaIngreso),
    fechaSalida: fechaSQLComoTexto(fechaSalida),
    antiguedadMeses,
    tarifaHora: Number(colaborador.TarifaHora),
    salarioDiarioVacaciones: salarioXDia,
    promedioSalarial: null,
  };

  // AGUINALDO PENDIENTE
  // Una salida en diciembre corresponde al siguiente ciclo anual.
  const anioAguinaldo =
    fechaSalida.getUTCFullYear() + (fechaSalida.getUTCMonth() === 11 ? 1 : 0);

  const aguinaldoPendiente = await aguinaldoService.calcularAguinaldo(
    anioAguinaldo,
    usuarioActor,
    {
      colaboradorId: colaboradorIdValid,
      fechaCorte: fechaSQLComoTexto(fechaSalida),
    },
    transaction,
  );

  const montoAguinaldo = Number(aguinaldoPendiente.totalAguinaldo ?? 0);

  let diasPreavisoPagados = 0,
    diasCesantiaPagados = 0,
    montoPreaviso = 0,
    montoCesantia = 0;

  if (datos.motivoSalida === "DESPIDO_CON_RESPONSABILIDAD") {
    // PREAVISO
    const diasPreavisoTotales =
      antiguedadMeses > 12
        ? DIAS_PREAVISO.UN_ANO_O_MAS
        : antiguedadMeses > 6
          ? DIAS_PREAVISO.SEIS_A_UN_ANO
          : antiguedadMeses >= 3
            ? DIAS_PREAVISO.TRES_A_SEIS_MESES
            : DIAS_PREAVISO.MENOS_DE_TRES_MESES;

    const diasPreavisoTrabajados = datos.diasPreavisoTrabajados ?? 0;

    if (diasPreavisoTrabajados > diasPreavisoTotales) {
      throw serviceError(
        `El preaviso cumplido no puede superar los ${diasPreavisoTotales} días que corresponden.`,
        400,
      );
    }

    diasPreavisoPagados = diasPreavisoTotales - diasPreavisoTrabajados;

    // CESANTÍA
    if (antiguedadMeses < 12) {
      diasCesantiaPagados =
        antiguedadMeses > 6 ? 14 : antiguedadMeses >= 3 ? 7 : 0;
    } else {
      const anosTrabajados = Math.floor(antiguedadMeses / 12);

      const mesesRestantes = antiguedadMeses - anosTrabajados * 12;

      const factorIndemnizacion = obtenerFactorIndemnizacion(anosTrabajados);

      // Una fracción mayor a seis meses reconoce otro año.
      // El máximo indemnizable es de ocho años.
      const anosIndemnizables = Math.min(
        anosTrabajados + (mesesRestantes > 6 ? 1 : 0),
        8,
      );

      diasCesantiaPagados = Number(
        (anosIndemnizables * factorIndemnizacion).toFixed(2),
      );
    }

    // SALARIO PROMEDIO PARA PREAVISO Y CESANTÍA
    if (diasPreavisoPagados > 0 || diasCesantiaPagados > 0) {
      let fechaDesdePromedio = sumarMesesUTC(fechaSalida, -6);

      // Si tiene menos de seis meses, comenzar en su ingreso.
      if (fechaDesdePromedio < fechaIngreso) {
        fechaDesdePromedio = fechaIngreso;
      }

      const salarioPromedio = await getSalariosParaPromedio(
        colaboradorIdValid,
        fechaDesdePromedio,
        fechaSalida,
        transaction,
      );

      // Consultar el período de la salida.
      const periodoActual = await periodoRepository.getPeriodoByFecha(
        fechaSalida,
        transaction,
      );

      if (!periodoActual) {
        throw serviceError(
          "No existe un período de planilla para la fecha de salida.",
          409,
        );
      }

      // El repositorio histórico debe devolver PeriodoId.
      const ultimoSalarioYaIncluido = salarioPromedio.some(
        (salario) => salario.PeriodoId === periodoActual.PeriodoId,
      );

      let ultimoSalario = {
        totalIngresos: 0,
      };

      // Evitar sumar nuevamente el período si ya está registrado.
      if (!ultimoSalarioYaIncluido) {
        ultimoSalario = await calcularDetalleColaborador(
          colaborador,
          periodoActual,
          transaction,
        );
      }

      const totalSalario =
        salarioPromedio.reduce((sum, s) => sum + Number(s.Monto), 0) +
        Number(ultimoSalario.totalIngresos);

      // Conservamos tu promedio mensual dividido entre treinta.
      const pagoXDiaPromedio = totalSalario / Math.min(antiguedadMeses, 6) / 30;

      baseCalculo.promedioSalarial = {
        desde: fechaSQLComoTexto(fechaDesdePromedio),
        hasta: fechaSQLComoTexto(fechaSalida),
        mesesConsiderados: Math.min(antiguedadMeses, 6),
        salarioAcumulado: totalSalario,
        salarioPromedioMensual: totalSalario / Math.min(antiguedadMeses, 6),
        salarioDiario: pagoXDiaPromedio,
      };

      montoCesantia = Number(
        (diasCesantiaPagados * pagoXDiaPromedio).toFixed(2),
      );

      montoPreaviso = Number(
        (diasPreavisoPagados * pagoXDiaPromedio).toFixed(2),
      );
    }
  }

  // Todos los importes son números, para evitar concatenar texto.
  const totalLiquidacion = Number(
    (montoVacaciones + montoAguinaldo + montoPreaviso + montoCesantia).toFixed(
      2,
    ),
  );

  return {
    colaboradorId: colaboradorIdValid,
    restauranteId: colaborador.RestauranteId,
    motivoSalida: datos.motivoSalida,
    fechaSalida,

    diasVacacionesPagados,
    diasPreavisoPagados,
    diasCesantiaPagados,

    montoVacaciones,
    montoAguinaldo,
    montoPreaviso,
    montoCesantia,

    totalLiquidacion,
    observacion: datos.observacion,
    baseCalculo,
  };
}

export async function confirmarLiquidacion(
  colaboradorId,
  datosSalida = {},
  usuario,
) {
  const transaction = await beginTransaction();
  try {
    const liquidacionCalculada = await calcularLiquidacion(
      usuario,
      colaboradorId,
      datosSalida,
      transaction,
    );

    if (!liquidacionCalculada) {
      throw serviceError("No se pudo calcular la liquidación.", 400);
    }

    const liquidacionGuardada = await liquidacionesRepository.createLiquidacion(
      { ...liquidacionCalculada, registradoPorUsuarioId: usuario.UsuarioId },
      transaction,
    );
    if (!liquidacionGuardada) {
      throw serviceError("No se pudo guardar la liquidación.", 500);
    }

    const colaboradorLiquidado =
      await colaboradoresRepository.liquidarColaborador(
        liquidacionCalculada.colaboradorId,
        liquidacionGuardada.FechaSalida,
        transaction,
      );

    if (!colaboradorLiquidado) {
      throw serviceError(
        "No se pudo actualizar el estado del colaborador.",
        500,
      );
    }

    const saldoVacacionesActualizadas =
      await saldosVacacionesRepository.updateDiasUtilizados(
        liquidacionCalculada.colaboradorId,
        liquidacionCalculada.diasVacacionesPagados,
        transaction,
      );

    if (!saldoVacacionesActualizadas) {
      throw serviceError(
        "No se pudo actualizar el saldo de vacaciones del colaborador.",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId: usuario.UsuarioId,
        entidad: entidades.LIQUIDACIONES,
        registroId: liquidacionGuardada.LiquidacionId,
        accion: acciones.CREAR,
        datosNuevos: {
          colaboradorId: liquidacionGuardada.ColaboradorId,
          restauranteId: liquidacionGuardada.RestauranteId,
          motivoSalida: liquidacionGuardada.MotivoSalida,
          fechaSalida: liquidacionGuardada.FechaSalida,
          diasVacacionesPagados: liquidacionGuardada.DiasVacacionesPagados,
          diasPreavisoPagados: liquidacionGuardada.DiasPreavisoPagados,
          diasCesantiaPagados: liquidacionGuardada.DiasCesantiaPagados,
          montoVacaciones: liquidacionGuardada.MontoVacaciones,
          montoAguinaldo: liquidacionGuardada.MontoAguinaldo,
          montoPreaviso: liquidacionGuardada.MontoPreaviso,
          montoCesantia: liquidacionGuardada.MontoCesantia,
          totalLiquidacion: liquidacionGuardada.TotalLiquidacion,
          observacion: liquidacionGuardada.Observacion,
        },
      },
      transaction,
    );

    await transaction.commit();
    return liquidacionGuardada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Error al hacer rollback de la transacción:",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function vincularLiquidacionConDetalle(
  detallePlanilla,
  usuarioActorId,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para vincular la liquidación.",
      500,
    );
  }

  const usuarioId = validateId(usuarioActorId, "UsuarioId");

  const liquidacionActual =
    await liquidacionesRepository.getLiquidacionByColaborador(
      detallePlanilla.ColaboradorId,
      transaction,
    );

  // No todos los colaboradores tienen una liquidación.
  if (!liquidacionActual) {
    return null;
  }

  if (liquidacionActual.DetallePlanillaId !== null) {
    // Si ya está vinculada a este detalle, no repetir la operación.
    if (
      liquidacionActual.DetallePlanillaId === detallePlanilla.DetallePlanillaId
    ) {
      return liquidacionActual;
    }

    throw serviceError(
      "La liquidación del colaborador ya está vinculada a otro detalle de planilla.",
      409,
    );
  }

  const liquidacionActualizada =
    await liquidacionesRepository.vincularDetallePlanilla(
      liquidacionActual.LiquidacionId,
      detallePlanilla.DetallePlanillaId,
      transaction,
    );

  if (!liquidacionActualizada) {
    throw serviceError(
      "No se pudo vincular la liquidación porque el registro cambió durante la operación.",
      409,
    );
  }

  await registrarBitacora(
    {
      usuarioId,
      entidad: entidades.LIQUIDACIONES,
      registroId: liquidacionActual.LiquidacionId,
      accion: acciones.ACTUALIZAR,
      datosAnteriores: liquidacionActual,
      datosNuevos: liquidacionActualizada,
    },
    transaction,
  );

  return liquidacionActualizada;
}
