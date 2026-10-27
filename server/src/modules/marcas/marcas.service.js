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
import { validarDiaSinPermisoAprobado } from "../permisosLaborales/permisosLaborales.service.js";
import { validarDiaSinIncapacidad } from "../incapacidades/services/incapacidades.services.js";
import { beginTransaction } from "../../shared/config/database.js";
import { validarDiasVacaciones } from "../vacaciones/services/vacaciones.service.js";
import { bloquearColaboradorSolicitudes } from "../solicitudes/solicitudes.repository.js";
import { clasificarJornada } from "../../shared/utils/jornadaUtils.js";
import { registrarBitacora, entidades, acciones } from "../bitacora/bitacora.service.js";

export async function consultarMisMarcas(usuario, filtros = {}) {
  if (!usuario) throw serviceError("Debe iniciar sesion", 401);
  if (usuario.Rol !== "COLABORADOR") {
    throw serviceError("Esta consulta corresponde al colaborador.", 403);
  }

  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  let desde = validateDate(filtros.desde, "Fecha desde", true);
  const hasta = validateDate(filtros.hasta, "Fecha hasta", true);

  if (desde && hasta && desde > hasta) {
    throw serviceError("La fecha desde no puede ser mayor que la fecha hasta", 400);
  }

  if(!desde && hasta)
    desde = hasta;
  
  return marcasRepository.getMarcasByColaborador(colaboradorId, { desde, hasta });
}

export async function consultarMarcasColaborador(
  usuario,
  colaboradorId,
  fechaAsignada,
  filtros = {},
) {
  if (!usuario) throw serviceError("Debe iniciar sesion", 401);
  if (!["GERENTE", "ADMINISTRADOR", "RECURSOS_HUMANOS"].includes(usuario.Rol)) {
    throw serviceError("No tenés permiso para consultar marcas de otros colaboradores.", 403);
  }

  const id = validateId(colaboradorId, "ColaboradorId");
  const fecha = validateDate(fechaAsignada, "Fecha asignada", true);
  let desde = validateDate(filtros.desde, "Fecha desde", true);
  const hasta = validateDate(filtros.hasta, "Fecha hasta", true);
  if (desde && hasta && desde > hasta) {
    throw serviceError("La fecha desde no puede ser mayor que la fecha hasta", 400);
  }
  if (!desde && hasta) desde = hasta;

  const restaurantePermitido = await getRestaurantePermitido(usuario);
  if (!fecha) {
    return marcasRepository.getMarcasByColaborador(id, {
      desde, hasta, restauranteId: restaurantePermitido,
    });
  }
  const asistencia =
    await asistenciasRepository.getAsistenciaByColaboradorYFecha(id, fecha);

  if (!asistencia) return [];
  // Se usa el restaurante de la jornada, incluso si hubo un traslado posterior.
  if (restaurantePermitido !== null && asistencia.RestauranteId !== restaurantePermitido) {
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
    await bloquearColaboradorSolicitudes(colaboradorId, transaction);
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

    await validarDiaSinPermisoAprobado(colaboradorId, fechaSQLComoTexto(fechaAsignada), transaction);
    await validarDiaSinIncapacidad(colaboradorId, fechaAsignada, transaction);
    await validarDiasVacaciones(colaboradorId, fechaAsignada, fechaAsignada, transaction);

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
    await bloquearColaboradorSolicitudes(colaboradorId, transaction);
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

    await validarDiaSinPermisoAprobado(colaboradorId, fechaSQLComoTexto(fechaAsignada), transaction);
    await validarDiaSinIncapacidad(colaboradorId, fechaAsignada, transaction);
    await validarDiasVacaciones(colaboradorId, fechaAsignada, fechaAsignada, transaction);

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

    // 8. Leer las marcas con la salida recién guardada. Los espacios no cuentan.
    const intervalos = await marcasRepository.getMarcasByFechaAndColaborador(
      fechaAsignada,
      colaboradorId,
      transaction,
    );
    
    const totalMinutos = intervalos.reduce((total, intervalo) => {
      if (intervalo.FechaHoraSalida == null) return total;
      return total + Math.floor(
        (intervalo.FechaHoraSalida - intervalo.FechaHoraEntrada) / 60_000,
      );
    }, 0);

    // Una segunda salida puede cambiar la clasificación del día completo.
    const { tipoJornada } = clasificarJornada(intervalos);
    const asistenciaClasificada = await asistenciasRepository.updateTipoJornada(
      asistenciaDiariaExistente.AsistenciaId,
      tipoJornada,
      transaction,
    );

    if (!asistenciaClasificada) {
      throw serviceError("No se pudo guardar la clasificación de la jornada", 500);
    }

    if (asistenciaDiariaExistente.TipoJornada !== tipoJornada) {
      await registrarBitacora(
        {
          usuarioId: usuario.UsuarioId,
          entidad: entidades.ASISTENCIAS_DIARIAS,
          registroId: asistenciaDiariaExistente.AsistenciaId,
          accion: acciones.ACTUALIZAR,
          datosAnteriores: { tipoJornada: asistenciaDiariaExistente.TipoJornada ?? null },
          datosNuevos: { tipoJornada },
        },
        transaction,
      );
    }

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
