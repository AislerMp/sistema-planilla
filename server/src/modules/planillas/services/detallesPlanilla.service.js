import * as detallesRepository from "../repositories/detallesPlanilla.repository.js";
import * as conceptosPlanillaService from "../services/conceptosPlanilla.service.js";
import {
  serviceError,
  validateId,
} from "../../../shared/utils/serviceUtils.js";
import { getAsistenciasByColaborador } from "../../asistenciasDiarias/asistenciasDiarias.repository.js";
import { getFeriadosByRango } from "../../feriados/feriados.repository.js";
import { getCalculosByPeriodo } from "../../vacaciones/repositorios/calculosVacaciones.repository.js";
import { getCalculosByPeriodo as getCalculosIncapacidadesByPeriodo } from "../../incapacidades/calculoIncapacidades.repository.js";
import { getDeduccionesLegalesYVigentes } from "../../deducciones/repositories/deducciones.repository.js";
import { getSolicitudesByColaborador } from "../../deducciones/repositories/solicitudDeducciones.repository.js";

export async function obtenerDetallePlanilla(
  detallePlanillaId,
  transaction = null,
) {
  const id = validateId(detallePlanillaId, "DetallePlanillaId");
  const detalle = await detallesRepository.getDetalleById(id, transaction);

  if (!detalle) {
    throw serviceError("El detalle de planilla no existe.", 404);
  }

  return detalle;
}

export async function listarDetallesPorPlanilla(
  planillaId,
  restauranteId = null,
  transaction = null,
) {
  const id = validateId(planillaId, "PlanillaId");
  return detallesRepository.getDetallesByPlanilla(id, restauranteId, transaction);
}

export async function listarDetallesPorColaborador(
  colaboradorId,
  transaction = null,
) {
  const id = validateId(colaboradorId, "ColaboradorId");
  return detallesRepository.getDetallesByColaborador(id, transaction);
}

export async function obtenerDetalleColaboradorByPeriodo(
  periodoId,
  colaboradorId,
  transaction = null,
) {
  const idPeriodo = validateId(periodoId, "PeriodoId");
  const idColaborador = validateId(colaboradorId, "ColaboradorId");

  const detalle = await detallesRepository.getDetalleColaboradorByPeriodo(
    idPeriodo,
    idColaborador,
    transaction,
  );

  if (!detalle) {
    throw serviceError(
      "El colaborador no tiene detalle de planilla en ese período.",
      404,
    );
  }

  return detalle;
}

export async function obtenerDetallesByRestaurante(
  restauranteId,
  periodoId = null,
  transaction = null,
) {
  const idRestaurante = validateId(restauranteId, "RestauranteId");
  const idPeriodo = validateId(periodoId, "PeriodoId", true);

  return detallesRepository.getDetallesByRestaurante(
    idRestaurante,
    idPeriodo,
    transaction,
  );
}

export async function calcularDetalleColaborador(
  colaborador,
  periodo,
  transaction = null,
) {
  // Es de prueba, un ejemplo ilustrativo para acomodar funciones.
  const datosCalculos = {
    tarifaHora: colaborador.TarifaHora,
    asistencias: await getAsistenciasByColaborador(
      colaborador.ColaboradorId,
      { periodoId: periodo.PeriodoId },
      transaction,
    ),
    feriados: await getFeriadosByRango(
      periodo.FechaInicio,
      periodo.FechaFin,
      transaction,
    ),
    vacaciones: await getCalculosByPeriodo(
      periodo.PeriodoId,
      colaborador.ColaboradorId,
      transaction,
    ),
    incapacidades: await getCalculosIncapacidadesByPeriodo(
      periodo.PeriodoId,
      colaborador.ColaboradorId,
      transaction,
    ),
  };

  const deduccionesLegales = await getDeduccionesLegalesYVigentes(
    periodo.FechaPago,
    transaction,
  );
  const deduccionesSolicitadas = (
    await getSolicitudesByColaborador(
      colaborador.ColaboradorId,
      {
        desde: periodo.FechaInicio,
        hasta: periodo.FechaFin,
        estado: "APROBADA",
      },
      transaction,
    )
  ).map(({ PorcentajeSolicitado, ...resto }) => ({
    ...resto,
    Porcentaje: PorcentajeSolicitado,
  }));

  datosCalculos.deducciones = [
    ...deduccionesLegales,
    ...deduccionesSolicitadas,
  ];

  const conceptosCalculados =
    await conceptosPlanillaService.calcularConceptosColaborador(datosCalculos);

  const totalIngresos = Number(
    conceptosCalculados
      .filter((concepto) => concepto.tipoConcepto === "INGRESO")
      .reduce((total, concepto) => total + concepto.monto, 0)
      .toFixed(2),
  );

  const totalDeducciones = Number(
    conceptosCalculados
      .filter((concepto) => concepto.tipoConcepto === "DEDUCCION")
      .reduce((total, concepto) => total + concepto.monto, 0)
      .toFixed(2),
  );

  const totalNeto = Number((totalIngresos - totalDeducciones).toFixed(2));

  const detalleCalculado = {
    colaboradorId: colaborador.ColaboradorId,
    restauranteId: colaborador.RestauranteId,
    tarifaHoraAplicada: colaborador.TarifaHora,

    totalIngresos,
    totalDeducciones,
    totalNeto,

    conceptos: conceptosCalculados,
  };

  return detalleCalculado;
}

export async function registrarDetallePlanilla(
  planillaId,
  detalleCalculado,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el detalle de la planilla.",
      500,
    );
  }

  const planillaID = validateId(planillaId, "PlanillaId");

  const detallePlanillaCreado =
    await detallesRepository.createDetallePlanilla(
      { ...detalleCalculado, planillaId: planillaID },
      transaction,
    );

  if (!detallePlanillaCreado) {
    throw serviceError(
      "No se pudo registrar el detalle de la planilla.",
      500,
    );
  }

  const conceptosRegistrados =
    await conceptosPlanillaService.registrarConceptosPlanilla(
      detallePlanillaCreado.DetallePlanillaId,
      detalleCalculado.conceptos,
      transaction,
    );

  return {
    ...detallePlanillaCreado,
    conceptos: conceptosRegistrados,
  };
}