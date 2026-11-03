import * as planillasRepository from "../repositories/planillas.repository.js";
import * as detallesPlanillasService from "../services/detallesPlanilla.service.js";
import * as periodosRepository from "../../periodoPlanilla/periodosPlanillas.repository.js";
import { getAllColaboradores, getColaboradorById } from "../../colaboradores/colaboradores.repository.js";
import { getRestaurantePermitido } from "../../colaboradores/colaboradores.service.js";
import { getPuestoById } from "../../puestos/puestos.repository.js";
import { beginTransaction } from "../../../shared/config/database.js";
import {
  serviceError,
  validateId,
  validateDate,
} from "../../../shared/utils/serviceUtils.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../../shared/utils/fechaUtils.js";

import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";

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

  return { planilla, detalles };
}

export async function calcularPreplanilla(
  periodoId,
  usuario,
  transaction = null,
) {
  const periodoID = validateId(periodoId, "PeriodoId");

  if (!["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario?.Rol)) {
    throw serviceError("No tenés permiso para consultar la preplanilla.", 403);
  }

  const periodo = await periodosRepository.getPeriodoById(
    periodoID,
    transaction,
  );

  if (!periodo) {
    throw serviceError("El período no existe.", 404);
  }

  if (!["ABIERTO", "EN_REVISION", "CERRADO"].includes(periodo.Estado)) {
    throw serviceError(
      "La preplanilla solo puede calcularse para un período abierto, en revisión o cerrado. Si ya fue pagado, consulte la planilla guardada.",
      409,
    );
  }

  let colaboradores;
  if (usuario.Rol === "COLABORADOR") {
    const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
    const colaborador = await getColaboradorById(colaboradorId, transaction);
    if (!colaborador) {
      throw serviceError("El colaborador no existe.", 404);
    }
    const puesto = await getPuestoById(colaborador.PuestoId, transaction);
    if (!puesto || puesto.TarifaHora == null || puesto.TarifaHora <= 0) {
      throw serviceError("El colaborador no tiene una tarifa por hora válida en su puesto.", 409);
    }

    colaboradores = [{ ...colaborador, TarifaHora: puesto.TarifaHora }];
  } else if (usuario.Rol === "GERENTE") {
    const restaurantePermitido = await getRestaurantePermitido(usuario);
    colaboradores = await getAllColaboradores(restaurantePermitido, transaction);
  } else {
    colaboradores = await getAllColaboradores(null, transaction);
  }


  const detallesCalculados = [];

  for (const colaborador of colaboradores) {
    const detalleColaborador =
      await detallesPlanillasService.calcularDetalleColaborador(
        colaborador,
        periodo,
        transaction,
      );

    // Puede tener ingresos pendientes aunque actualmente esté inactivo.
    if (detalleColaborador.totalIngresos > 0) {
      detallesCalculados.push(detalleColaborador);
    }
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
  if (!["RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario?.Rol)) {
    throw serviceError("No tenés permiso para registrar el pago de la planilla.", 403);
  }

  const periodoID = validateId(periodoId, "PeriodoId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const transaction = await beginTransaction();

  try {
    // El tercer parámetro activa el bloqueo únicamente para registrar el pago.
    const periodo = await periodosRepository.getPeriodoById(
      periodoID,
      transaction,
      true,
    );

    if (!periodo) {
      throw serviceError("El período no existe.", 404);
    }

    if (periodo.Estado !== "CERRADO") {
      throw serviceError(
        "Solo se puede registrar el pago de un período cerrado y sin pagar.",
        409,
      );
    }

    const { fechaHoy } = obtenerCalendarioActual();

    if (fechaHoy < fechaSQLComoTexto(periodo.FechaPago)) {
      throw serviceError(
        "Todavía no ha llegado la fecha de pago del período.",
        409,
      );
    }

    const planillaExistente =
      await planillasRepository.getPlanillaByPeriodo(
        periodoID,
        transaction,
      );

    if (planillaExistente) {
      throw serviceError(
        "Este período ya tiene una planilla registrada.",
        409,
      );
    }

    // 1. Crear la cabecera con totales en cero.
    const planillaInicializada =
      await planillasRepository.createPlanilla(
        {
          periodoId: periodoID,
          fechaPago: validateDate(fechaHoy, "Fecha de pago"),
          registradoPorUsuarioId: usuarioId,
          totalIngresos: 0,
          totalDeducciones: 0,
          totalNeto: 0,
        },
        transaction,
      );

    if (!planillaInicializada) {
      throw serviceError(
        "No se pudo inicializar la planilla.",
        500,
      );
    }

    // 2. Calcular los detalles y conceptos de todos los colaboradores.
    const { resumenGeneralPlanilla, detallesCalculados } =
      await calcularPreplanilla(
        periodoID,
        usuario,
        transaction,
      );

    if (detallesCalculados.length === 0) {
      throw serviceError(
        "No hay ingresos para registrar una planilla en este período.",
        409,
      );
    }

    // 3. Registrar cada detalle y sus conceptos.
    for (const detalle of detallesCalculados) {
      await detallesPlanillasService.registrarDetallePlanilla(
        planillaInicializada.PlanillaId,
        detalle,
        transaction,
      );
    }

    // 4. Completar los totales de la cabecera.
    const planillaFinalizada =
      await planillasRepository.updateTotalesPlanilla(
        planillaInicializada.PlanillaId,
        resumenGeneralPlanilla,
        transaction,
      );

    if (!planillaFinalizada) {
      throw serviceError(
        "No se pudieron actualizar los totales de la planilla.",
        500,
      );
    }

    // 5. Confirmar el estado del período dentro de la misma transacción.
    const periodoActualizado =
      await periodosRepository.updateEstadoPeriodo(
        periodoID,
        "CERRADO",
        "PAGADO",
        transaction,
      );

    if (!periodoActualizado) {
      throw serviceError(
        "El estado del período cambió durante el registro del pago.",
        409,
      );
    }

    // 6. Registrar la creación de la planilla.
    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.PLANILLAS,
        registroId: planillaFinalizada.PlanillaId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: planillaFinalizada,
      },
      transaction,
    );

    // 7. Registrar el cambio de estado del período.
    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.PERIODOS_PLANILLA,
        registroId: periodoID,
        accion: acciones.CAMBIAR_ESTADO,
        datosAnteriores: periodo,
        datosNuevos: periodoActualizado,
      },
      transaction,
    );

    await transaction.commit();

    return planillaFinalizada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir el registro del pago de la planilla:",
        rollbackError,
      );
    }

    throw error;
  }
}
