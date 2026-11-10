import * as aguinaldoRepository from "./aguinaldo.repository.js";

import {
  validateId,
  validateDate,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

import { obtenerCalendarioActual } from "../../shared/utils/fechaUtils.js";

import { getRestaurantePermitido } from "../colaboradores/colaboradores.service.js";

import { beginTransaction } from "../../shared/config/database.js";

import {
  registrarBitacora,
  entidades,
  acciones,
} from "../bitacora/bitacora.service.js";

function validarFiltrosAguinaldo(filtros) {
  const anio = validateId(filtros.anio, "Año", true);
  if (anio !== null && (anio < 1900 || anio > 9999)) {
    throw serviceError("El año debe estar entre 1900 y 9999.", 400);
  }

  return {
    aguinaldoId: validateId(filtros.aguinaldoId, "AguinaldoId", true),
    anio,
    colaboradorId: validateId(filtros.colaboradorId, "ColaboradorId", true),
    restauranteId: validateId(filtros.restauranteId, "RestauranteId", true),
  };
}

// Histórico general de cabeceras. RH y administrador.
export async function listarAguinaldos() {
  return await aguinaldoRepository.getAguinaldos();
}

// Consulta de una cabecera. RH y administrador.
export async function obtenerAguinaldo(aguinaldoId) {
  const iD = validateId(aguinaldoId);

  const aguinaldo = await aguinaldoRepository.getAguinaldoById(iD);
  if (!aguinaldo) {
    throw serviceError("Aguinaldo no encontrado", 404);
  }

  return aguinaldo;
}

// Resultados confirmados, según el alcance del usuario.
export async function listarDetallesAguinaldo(usuario, filtros = {}) {
  if (
    filtros === null ||
    typeof filtros !== "object" ||
    Array.isArray(filtros)
  ) {
    throw serviceError("Los filtros del aguinaldo deben ser un objeto.", 400);
  }

  const esColaborador = usuario.Rol === "COLABORADOR";
  const esGerente = usuario.Rol === "GERENTE";

  const filtrosValidados = validarFiltrosAguinaldo({
    ...filtros,
    colaboradorId: esColaborador
      ? validateId(usuario.ColaboradorId, "ColaboradorId")
      : filtros.colaboradorId,
    restauranteId: esColaborador || esGerente ? null : filtros.restauranteId,
  });

  // La asignación vigente del gerente siempre prevalece sobre los filtros del cliente.
  const restauranteId = esGerente
    ? await getRestaurantePermitido(usuario)
    : filtrosValidados.restauranteId;

  return aguinaldoRepository.getDetallesAguinaldo({
    ...filtrosValidados,
    restauranteId,
  });
}

const PORCENTAJE_TOTAL = 100;
const MINUTOS_POR_HORA = 60;
const MESES_POR_ANIO = 12;
// Consulta preliminar. No guarda registros.
export async function calcularAguinaldo(
  anio,
  usuario,
  filtros = {},
  transaction = null,
) {
  const filtrosValidados = validarFiltrosAguinaldo({
    ...filtros,
    colaboradorId:
      usuario.Rol === "COLABORADOR"
        ? usuario.ColaboradorId
        : filtros.colaboradorId,
    restauranteId:
      usuario.Rol === "COLABORADOR" || usuario.Rol === "GERENTE"
        ? null
        : filtros.restauranteId,
  });

  const restauranteId =
    usuario.Rol === "GERENTE"
      ? await getRestaurantePermitido(usuario)
      : filtrosValidados.restauranteId;

  const anioValidado = validateId(anio, "Año");

  if (anioValidado < 1900 || anioValidado > 9999) {
    throw serviceError("El año debe estar entre 1900 y 9999.", 400);
  }

  const fechaInicio = `${anioValidado - 1}-12-01`;
  const fechaFinCiclo = `${anioValidado}-11-30`;
  const fechaFin = filtros.fechaCorte ?? fechaFinCiclo;

  const desde = validateDate(fechaInicio, "Fecha inicial");
  const hasta = validateDate(fechaFin, "Fecha final");

  if (
    hasta < desde ||
    hasta > validateDate(fechaFinCiclo, "Fecha final del ciclo")
  ) {
    throw serviceError(
      "La fecha de corte debe estar dentro del ciclo de aguinaldo.",
      400,
    );
  }

  const filtrosConsulta = {
    ...filtrosValidados,
    restauranteId,
  };

  const salariosAcumulados = await aguinaldoRepository.getSalariosAcumulados(
    desde,
    hasta,
    filtrosConsulta,
    transaction,
  );

  const maternidadesPagadas = await aguinaldoRepository.getMaternidadesPagadas(
    desde,
    hasta,
    filtrosConsulta,
    transaction,
  );

  const detalles = [];

  // Incluir los salarios, aunque el colaborador no tenga maternidad.
  for (const salario of salariosAcumulados) {
    detalles.push({
      colaboradorId: salario.ColaboradorId,
      restauranteId: salario.RestauranteId,
      nombres: salario.Nombres,
      apellido1: salario.Apellido1,
      apellido2: salario.Apellido2,
      restaurante: salario.Restaurante,
      salarioAcumulado: salario.SalarioAcumulado,
    });
  }

  // Acumular todos los reconocimientos de maternidad.
  for (const maternidad of maternidadesPagadas) {
    const porcentaje = maternidad.PorcentajePatronalAplicado;

    if (
      !Number.isFinite(porcentaje) ||
      porcentaje <= 0 ||
      porcentaje > PORCENTAJE_TOTAL
    ) {
      throw serviceError(
        `El cálculo de maternidad ${maternidad.CalculoId} tiene un porcentaje patronal inválido.`,
        409,
      );
    }

    if (maternidad.MinutosReconocidos === 0) {
      continue;
    }

    const montoPatronal =
      (maternidad.MinutosReconocidos / MINUTOS_POR_HORA) *
      maternidad.TarifaHoraAplicada;

    const baseMaternidad = montoPatronal / (porcentaje / PORCENTAJE_TOTAL);

    const detalleExistente = detalles.find(
      (detalle) => detalle.colaboradorId === maternidad.ColaboradorId,
    );

    if (detalleExistente) {
      detalleExistente.salarioAcumulado += baseMaternidad;
    } else {
      // También incluir a quien solamente tenga maternidad.
      detalles.push({
        colaboradorId: maternidad.ColaboradorId,
        restauranteId: maternidad.RestauranteId,
        nombres: maternidad.Nombres,
        apellido1: maternidad.Apellido1,
        apellido2: maternidad.Apellido2,
        restaurante: maternidad.Restaurante,
        salarioAcumulado: baseMaternidad,
      });
    }
  }

  // Calcular el resultado individual después de consolidar ambas fuentes.
  for (const detalle of detalles) {
    detalle.salarioAcumulado = Number(detalle.salarioAcumulado.toFixed(2));

    detalle.montoAguinaldo = Number(
      (detalle.salarioAcumulado / MESES_POR_ANIO).toFixed(2),
    );
  }

  const totalAguinaldo = Number(
    detalles
      .reduce((total, detalle) => total + detalle.montoAguinaldo, 0)
      .toFixed(2),
  );

  return {
    anio: anioValidado,
    fechaInicio,
    fechaFin,
    totalAguinaldo,
    detalles,
  };
}

// Calcula nuevamente y guarda el resultado definitivo.
export async function confirmarAguinaldo(anio, usuario) {
  const anioValidado = validateId(anio, "El año del aguinaldo es inválido.");

  if (anioValidado < 1900 || anioValidado > 9999) {
    throw serviceError("El año debe estar entre 1900 y 9999.", 400);
  }

  const transaction = await beginTransaction();

  try {
    const aguinaldoExistente = await aguinaldoRepository.getAguinaldoByAnio(
      anioValidado,
      transaction,
    );

    if (aguinaldoExistente) {
      throw serviceError(
        "El aguinaldo para este año ya ha sido confirmado.",
        409,
      );
    }

    const aguinaldoDetalles = await calcularAguinaldo(
      anioValidado,
      usuario,
      {},
      transaction,
    );

    if (!aguinaldoDetalles || aguinaldoDetalles.detalles.length === 0) {
      throw serviceError(
        "No se pudieron calcular los detalles del aguinaldo.",
        400,
      );
    }

    const aguinaldoGuardado = await aguinaldoRepository.createAguinaldo(
      {
        anio: anioValidado,
        totalAguinaldo: aguinaldoDetalles.totalAguinaldo,
        registradoPorUsuarioId: usuario.UsuarioId,
        estado: "CONFIRMADO",
      },
      transaction,
    );

    if (!aguinaldoGuardado) {
      throw serviceError("No se pudo guardar el aguinaldo.", 500);
    }

    for (const detalle of aguinaldoDetalles.detalles) {
      const detalleGuardado = await aguinaldoRepository.createDetalleAguinaldo(
        {
          ...detalle,
          aguinaldoId: aguinaldoGuardado.AguinaldoId,
        },
        transaction,
      );

      if (!detalleGuardado) {
        throw serviceError("No se pudo guardar el detalle del aguinaldo.", 500);
      }
    }
    await transaction.commit();
    return aguinaldoDetalles;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (err) {
      throw serviceError("Error al hacer rollback de la transacción.", 500);
    }
    throw error;
  }
}
