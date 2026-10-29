import * as planillasRepository from "../repositories/planillas.repository.js";
import * as detallesPlanillasService from "../services/detallesPlanilla.service.js";
import * as periodosRepository from "../../periodoPlanilla/periodosPlanillas.repository.js";
import { getAllColaboradores } from "../../colaboradores/colaboradores.repository.js";
import {
  serviceError,
  validateId,
} from "../../../shared/utils/serviceUtils.js";
import { beginTransaction } from "../../../shared/config/database.js";

// La generación, los cálculos y la bitácora de la planilla quedan pendientes.
export async function listarPlanillas(transaction = null) {
  return await planillasRepository.getPlanillas(transaction);
}

export async function obtenerPlanilla(planillaId, transaction = null) {
  const id = validateId(planillaId, "PlanillaId");
  const planilla = await planillasRepository.getPlanillaById(id, transaction);

  if (!planilla) {
    throw serviceError("La planilla no existe.", 404);
  }

  return planilla;
}

export async function obtenerPlanillaPorPeriodo(periodoId, transaction = null) {
  const id = validateId(periodoId, "PeriodoId");
  const planilla = await planillasRepository.getPlanillaByPeriodo(
    id,
    transaction,
  );

  if (!planilla) {
    throw serviceError(
      "No existe una planilla registrada para ese período.",
      404,
    );
  }

  return planilla;
}

export async function obtenerPlanillasConDetallesRestaurante(
  restauranteId = null,
  periodoId,
  transaction = null,
) {
  const idRestaurante = validateId(restauranteId, "RestauranteId", true);
  const idPeriodo = validateId(periodoId, "PeriodoId");

  const planilla = await planillasRepository.getPlanillaByPeriodo(
    idPeriodo,
    transaction,
  );

  if (!planilla) {
    throw serviceError(
      "No existe una planilla registrada para ese período.",
      404,
    );
  }

  const detalles = await detallesPlanillasService.listarDetallesPorPlanilla(
    planilla.PlanillaId,
    idRestaurante,
    transaction,
  );

  if (!detalles || detalles.length === 0) {
    throw serviceError(
      "No existen detalles de planilla para ese restaurante en el período seleccionado.",
      404,
    );
  }

  return { planilla, detalles };
}

export async function calcularPreplanilla(
  periodoId,
  usuario,
  transaction = null,
) {
  const periodo = await periodosRepository.getPeriodoById(
    periodoId,
    transaction,
  );

  if (!periodo) {
    throw serviceError("El período no existe.", 404);
  }

  const todosColaboradores = await getAllColaboradores(null, transaction);
  const colaboradores = todosColaboradores.filter(
    (colaborador) => colaborador.Activo,
  );

  const detallesCalculados = [];
  for (const colaborador of colaboradores) {
    const detalleColaborador =
      await detallesPlanillasService.calcularDetalleColaborador(
        colaborador,
        periodo,
        transaction,
      );
    detallesCalculados.push(detalleColaborador);
  }

  const resumenGeneralPlanilla = {
    totalIngresos: Number(
      detallesCalculados
        .reduce((sum, detalle) => sum + detalle.totalIngresos, 0)
        .toFixed(2),
    ),
    totalDeducciones: Number(
      detallesCalculados
        .reduce((sum, detalle) => sum + detalle.totalDeducciones, 0)
        .toFixed(2),
    ),
    totalNeto: Number(
      detallesCalculados
        .reduce((sum, detalle) => sum + detalle.totalNeto, 0)
        .toFixed(2),
    ),
  };

  return { periodo, resumenGeneralPlanilla, detallesCalculados };
}

export async function registrarPagoPlanilla(periodoId, usuario) {
  const periodoID = validateId(periodoId, "PeriodoId");

  const transaction = await beginTransaction();

  try {
    // Aquí iría la lógica para registrar el pago de la planilla
    const periodo = await periodosRepository.getPeriodoById(
      periodoId,
      transaction,
    );

    if (periodo.Estado !== "CERRADO" || periodo.Estado === "PAGADO") {
      throw serviceError(
        "El período no está cerrado o ya ha sido pagado, no se puede registrar el pago.",
        400,
      );
    }

    const planillaInicializada = await planillasRepository.createPlanilla(
      {
        periodoId: periodoID,
        fechaPago: new Date(),
        registradoPorUsuarioId: usuario.UsuarioId,
        totalIngresos: 0,
        totalDeducciones: 0,
        totalNeto: 0,
      },
      transaction,
    );

    if (!planillaInicializada) {
      throw serviceError("No se pudo inicializar la planilla.", 500);
    }

    const preplanilla = await calcularPreplanilla(
      periodoID,
      usuario,
      transaction,
    );

    const { resumenGeneralPlanilla, detallesCalculados } = preplanilla;

    const todosColaboradores = await getAllColaboradores(null, transaction);
    const colaboradores = todosColaboradores.filter(
      (colaborador) => colaborador.Activo,
    );

    for (const colaborador of colaboradores) {
      const detalle = detallesCalculados.find(
        (detalle) => detalle.colaboradorId === colaborador.ColaboradorId,
      );

      if (!detalle) {
        throw serviceError(
          `No se encontró el detalle calculado para el colaborador con ID ${colaborador.ColaboradorId}.`,
          500,
        );
      }

      await detallesPlanillasService.registrarDetallePlanilla(
        planillaInicializada.PlanillaId,
        detalle,
        transaction,
      );
    }

    const planillaFinalizada = await planillasRepository.updateTotalesPlanilla(
      planillaInicializada.PlanillaId,
      resumenGeneralPlanilla,
      transaction,
    );

    if (!planillaFinalizada) {
      throw serviceError("No se pudo finalizar la planilla.", 500);
    }

    await transaction.commit();
    return planillaFinalizada;
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
