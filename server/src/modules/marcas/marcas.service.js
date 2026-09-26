import {
  validateId,
  validateDate,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

import * as marcasRepository from "./marcas.repository.js";
import * as asistenciasRepository from "../asistenciasDiarias/asistenciasDiarias.repository.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";
import {
  crearAsistenciaDiaria,
  actualizarMinutosCalculados,
} from "../asistenciasDiarias/asistenciasDiarias.service.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import {
  getRestaurantePermitido,
  getColaborador,
} from "../colaboradores/colaboradores.service.js";
import { sincronizarHorasExtras } from "../extras/horasExtras.service.js";
import { beginTransaction } from "../../shared/config/database.js";

export async function consultarMisMarcas(usuario, fechaAsignada) {
  if (!usuario) throw serviceError("Debe iniciar sesion", 401);
  if (usuario.Rol !== "COLABORADOR") {
    throw serviceError("Esta consulta corresponde al colaborador.", 403);
  }

  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const fecha = validateDate(fechaAsignada, "Fecha asignada");

  return marcasRepository.getMarcasByFechaAndColaborador(fecha, colaboradorId);
}

export async function consultarMarcasColaborador(
  usuario,
  colaboradorId,
  fechaAsignada,
) {
  if (!usuario) throw serviceError("Debe iniciar sesion", 401);
  if (usuario.Rol !== "GERENTE") {
    throw serviceError("Solo el gerente puede realizar esta consulta.", 403);
  }

  const id = validateId(colaboradorId, "ColaboradorId");
  const fecha = validateDate(fechaAsignada, "Fecha asignada");

  const restaurantePermitido = await getRestaurantePermitido(usuario);
  const asistencia =
    await asistenciasRepository.getAsistenciaByColaboradorYFecha(id, fecha);

  if (!asistencia) return [];
  // Se usa el restaurante de la jornada, incluso si hubo un traslado posterior.
  if (asistencia.RestauranteId !== restaurantePermitido) {
    throw serviceError(
      "Solo podés consultar marcas de tu restaurante asignado.",
      403,
    );
  }

  return marcasRepository.getMarcasByFechaAndColaborador(fecha, id);
}

export async function registrarEntrada(usuario) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const colaboradorActual = await getColaborador(colaboradorId, usuario);

  if (!colaboradorActual)
    throw serviceError("Colaborador Actual no existe", 404);

  if (!colaboradorActual.Activo) {
    throw serviceError("El colaborador está inactivo", 409);
  }

  const ahora = new Date();
  let { fechaAsignada } = obtenerCalendarioActual(ahora);
  fechaAsignada = validateDate(fechaAsignada);

  const transaction = await beginTransaction();

  try {
    const periodo = await periodoRepository.getPeriodoByFecha(
      fechaAsignada,
      transaction,
    );

    if (!periodo) {
      throw serviceError(
        "No existe un período de planilla para esta fecha",
        409,
      );
    }

    if (periodo.Estado !== "ABIERTO") {
      throw serviceError("El período no permite registrar nuevas marcas", 409);
    }

    const existeMarcaPendiente = await marcasRepository.getIntervaloPendiente(
      colaboradorActual.ColaboradorId,
      fechaAsignada,
      transaction,
    );

    if (existeMarcaPendiente)
      throw serviceError(
        "Ya has marcado entrada, tienes una salida pendiente",
        409,
      );

    const marcas = await marcasRepository.getMarcasByFechaAndColaborador(
      fechaAsignada,
      colaboradorId,
      transaction,
    );

    if (marcas.length >= 2) {
      throw serviceError("Ya completaste los dos intervalos de este día", 409);
    }

    const asistenciaDiariaExistente =
      await asistenciasRepository.getAsistenciaByColaboradorYFecha(
        colaboradorId,
        fechaAsignada,
        transaction,
      );

    if (!asistenciaDiariaExistente) {
      await crearAsistenciaDiaria(
        colaboradorActual,
        fechaSQLComoTexto(fechaAsignada),
        transaction,
      );
    }

    const numeroIntervalo = marcas.length + 1;
    const marcaCreada = await marcasRepository.createMarcaEntrada(
      {
        colaboradorId,
        fechaAsignada,
        numeroIntervalo,
        fechaHoraEntrada: ahora,
      },
      transaction,
    );

    if (!marcaCreada) {
      throw serviceError("No se pudo registrar la entrada", 500);
    }

    await transaction.commit();
    return marcaCreada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Error al revertir el ajuste de asistencia:",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function registrarSalida(usuario) {
  // 1. Validar usuario y colaborador.
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const colaboradorActual = await getColaborador(colaboradorId, usuario);

  if (!colaboradorActual)
    throw serviceError("Colaborador Actual no existe", 404);

  if (!colaboradorActual.Activo) {
    throw serviceError("El colaborador está inactivo", 409);
  }

  // 2. Obtener ahora y fechaAsignada.
  const ahora = new Date();
  let { fechaAsignada } = obtenerCalendarioActual(ahora);
  fechaAsignada = validateDate(fechaAsignada);

  // 3. Iniciar transacción.
  const transaction = await beginTransaction();

  try {
    // 4. Validar período abierto.
    const periodo = await periodoRepository.getPeriodoByFecha(
      fechaAsignada,
      transaction,
    );

    if (!periodo) {
      throw serviceError(
        "No existe un período de planilla para esta fecha",
        409,
      );
    }

    if (periodo.Estado !== "ABIERTO") {
      throw serviceError("El período no permite registrar nuevas marcas", 409);
    }

    // 5. Buscar y validar el intervalo pendiente.
    const marcaPendiente = await marcasRepository.getIntervaloPendiente(
      colaboradorId,
      fechaAsignada,
      transaction,
    );

    //Si no hay marca...
    if (!marcaPendiente)
      throw serviceError("No hay una marca pendiente de salida", 409);

    if (ahora.getTime() < marcaPendiente.FechaHoraEntrada.getTime()) {
      throw serviceError("La salida no puede ser anterior a la entrada", 409);
    }

    // 6. Obtener y validar la asistencia diaria.
    const asistenciaDiariaExistente =
      await asistenciasRepository.getAsistenciaByColaboradorYFecha(
        colaboradorId,
        fechaAsignada,
        transaction,
      );

    if (!asistenciaDiariaExistente)
      throw serviceError("Asistencia Diaria no fue encontrada", 404);

    if (asistenciaDiariaExistente.PeriodoId !== periodo.PeriodoId) {
      throw serviceError(
        "La asistencia no corresponde al período encontrado",
        409,
      );
    }

    // 7. Guardar la salida.
    const marcaSalidaGuardada = await marcasRepository.marcarSalida(
      marcaPendiente.MarcaId,
      ahora,
      transaction,
    );

    if (!marcaSalidaGuardada)
      throw serviceError("No se pudo marcar la salida", 409);

    // 8. Consultar los intervalos y calcular el total diario.
    const fechaHoraEntrada = marcaSalidaGuardada.FechaHoraEntrada;
    const fechaHoraSalida = marcaSalidaGuardada.FechaHoraSalida;

    const minutosDelIntervalo = Math.floor(
      (fechaHoraSalida - fechaHoraEntrada) / 60000,
    );

    const minutosCalculadosActuales =
      asistenciaDiariaExistente.MinutosCalculados ?? 0;

    const totalMinutos = minutosCalculadosActuales + minutosDelIntervalo;

    // 9. Actualizar minutos calculados y su bitácora.
    const asistenciaDiariaCalculada = await actualizarMinutosCalculados(
      asistenciaDiariaExistente.AsistenciaId,
      totalMinutos,
      transaction,
      usuario,
    );
    
    // Guardar las extras según la asistencia recién actualizada.
    await sincronizarHorasExtras(
      asistenciaDiariaCalculada,
      usuario.UsuarioId,
      transaction,
    );

    // 10. Confirmar y devolver el resultado.
    await transaction.commit();
    return {
      marca: marcaSalidaGuardada,
      asistencia: asistenciaDiariaCalculada,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "Error al revertir el ajuste de asistencia:",
        rollbackError,
      );
    }
    throw error;
  }
}
