import * as vacacionesRepository from "../repositorios/vacaciones.repository.js";

import { beginTransaction } from "../../../shared/config/database.js";
import {
  serviceError,
  validateDate,
  validateId,
  validateText,
} from "../../../shared/utils/serviceUtils.js";
import * as colaboradorRepository from "../../colaboradores/colaboradores.repository.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";
import * as saldosRepository from "../repositorios/saldosVacaciones.repository.js";
import {
  bloquearColaboradorSolicitudes,
  revisarSolicitudGerente,
  resolverSolicitudRh,
  revertirSolicitud,
} from "../../solicitudes/solicitudes.repository.js";
import {
  validarAccesoSolicitud,
  validarFiltrosSolicitudes,
  validarRestauranteSolicitudes,
} from "../../../shared/utils/solicitudUtils.js";

import { registrarCalculoVacaciones } from "./calculosVacaciones.service.js";
import * as calculosRepository from "../repositorios/calculosVacaciones.repository.js";
import { fechaSQLComoTexto } from "../../../shared/utils/fechaUtils.js";
export async function getVacacionesById(solicitudID, usuario) {
  const id = validateId(solicitudID);

  const vacacionSolicitud =
    await vacacionesRepository.getVacacionSolicitudById(id);

  if (!vacacionSolicitud) {
    throw serviceError("No se encontró la solicitud de vacaciones.", 404);
  }

  await validarAccesoSolicitud(vacacionSolicitud, usuario);
  return vacacionSolicitud;
}

export async function getMisVacaciones(filtros = {}, usuario) {
  const colaboradorId = validateId(usuario.ColaboradorId);
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  return await vacacionesRepository.getVacacionesByColaborador(
    colaboradorId,
    filtrosValidados,
  );
}

export async function getVacacionesByRestaurante(
  restauranteId,
  filtros,
  usuario,
) {
  const restauranteSolicitado = validateId(
    restauranteId,
    "RestauranteId",
    true,
  );
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  const restauranteConsultaId =
    usuario.Rol !== "GERENTE" && restauranteSolicitado === null
      ? null
      : await validarRestauranteSolicitudes(restauranteSolicitado, usuario);

  return await vacacionesRepository.getVacacionesByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

export async function solicitarVacaciones(datos, usuario) {
  const usuarioId = validateId(usuario?.UsuarioId, "UsuarioId");
  const colaboradorId = validateId(usuario?.ColaboradorId, "ColaboradorId");
  const colaboradorActual =
    await colaboradorRepository.getColaboradorById(colaboradorId);

  if (!colaboradorActual) {
    throw serviceError(
      "No se encontró el colaborador asociado al usuario.",
      404,
    );
  }

  const datosSolicitud = {
    colaboradorId: validateId(colaboradorActual.ColaboradorId, "ColaboradorId"),
    restauranteId: validateId(colaboradorActual.RestauranteId, "RestauranteId"),
    registradoPorUsuarioId: usuarioId,
    motivo: validateText(datos.motivo, "Motivo", 500, true),
  };

  const fechaInicio = validateDate(datos.fechaInicio, "Fecha de inicio");
  const fechaFin = validateDate(datos.fechaFin, "Fecha de fin");

  if (fechaFin < fechaInicio) {
    throw serviceError(
      "La fecha de fin no puede ser anterior a la fecha de inicio.",
      400,
    );
  }

  const diferenciaDias =
    Math.floor((fechaFin.getTime() - fechaInicio.getTime()) / 86_400_000) + 1;

  const datosVacaciones = {
    fechaInicio,
    fechaFin,
    diasSolicitados: diferenciaDias,
  };

  const transaction = await beginTransaction();

  try {
    await bloquearColaboradorSolicitudes(
      datosSolicitud.colaboradorId,
      transaction,
    );

    const existeSuperPosicion =
      await vacacionesRepository.getVacacionesSuperpuestas(
        datosSolicitud.colaboradorId,
        datosVacaciones.fechaInicio,
        datosVacaciones.fechaFin,
        transaction,
      );

    if (existeSuperPosicion.length > 0) {
      throw serviceError(
        "Existe una solicitud de vacaciones que se traslapa con esas fechas.",
        409,
      );
    }

    const saldoVacaciones = await saldosRepository.getSaldoByColaborador(
      datosSolicitud.colaboradorId,
      transaction,
    );

    if (!saldoVacaciones) {
      throw serviceError(
        "El saldo de vacaciones no está inicializado. Contactá a Recursos Humanos.",
        409,
      );
    }

    if (
      Number(saldoVacaciones.DiasDisponibles) <
      Number(datosVacaciones.diasSolicitados)
    ) {
      throw serviceError(
        "Los días solicitados superan los días disponibles.",
        409,
      );
    }

    const vacacionesCreadas = await vacacionesRepository.createVacaciones(
      {
        ...datosSolicitud,
        ...datosVacaciones,
      },
      transaction,
    );

    if (!vacacionesCreadas)
      throw serviceError("Hubo un problema al crear solicitud Vacaciones", 500);

    await registrarBitacora(
      {
        usuarioId: datosSolicitud.registradoPorUsuarioId,
        entidad: entidades.VACACIONES,
        registroId: vacacionesCreadas.SolicitudId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: vacacionesCreadas,
      },
      transaction,
    );

    await transaction.commit();
    return vacacionesCreadas;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la creación de la solicitud de vacaciones:",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function revisarVacacionesGerente(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "GERENTE") {
    throw serviceError(
      "Solo el gerente puede revisar y enviar solicitudes de vacaciones a Recursos Humanos.",
      403,
    );
  }

  const usuarioActualId = validateId(usuario.UsuarioId, "UsuarioId");
  const id = validateId(solicitudId, "SolicitudId");

  const observacionValidada = validateText(
    datosRevision.observacion,
    "Observación",
    500,
    true,
  );

  const estadoValidado = validateText(
    datosRevision.estado,
    "Estado",
    20,
  ).toUpperCase();

  if (!["RECHAZADA", "EN_REVISION_RH"].includes(estadoValidado)) {
    throw serviceError(
      "El gerente solo puede rechazar la solicitud o enviarla a revisión de Recursos Humanos.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    let solicitudActual = await vacacionesRepository.getVacacionSolicitudById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError("No se encontró la solicitud de vacaciones.", 404);
    }

    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    // Volver a consultar después de obtener el bloqueo.
    solicitudActual = await vacacionesRepository.getVacacionSolicitudById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError(
        "La solicitud de vacaciones ya no está disponible.",
        404,
      );
    }

    await validarAccesoSolicitud(
      solicitudActual,
      usuario,
      "Solo puede revisar solicitudes de su restaurante asignado.",
    );

    if (solicitudActual.Estado !== "PENDIENTE") {
      throw serviceError(
        "La solicitud ya fue revisada y no está pendiente de revisión del gerente.",
        409,
      );
    }

    const vacacionRevisada = await revisarSolicitudGerente(
      id,
      "VACACIONES",
      {
        estado: estadoValidado,
        observacion: observacionValidada,
        revisadoPorGerenteId: usuarioActualId,
      },
      transaction,
    );

    if (!vacacionRevisada) {
      throw serviceError(
        "No se pudo revisar la solicitud porque su estado cambió durante la operación.",
        409,
      );
    }

    const accionBitacora =
      estadoValidado === "EN_REVISION_RH"
        ? acciones.APROBAR_REVISION_VACACIONES
        : acciones.RECHAZAR_VACACIONES;

    await registrarBitacora(
      {
        usuarioId: usuarioActualId,
        entidad: entidades.VACACIONES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: solicitudActual,
        datosNuevos: { ...solicitudActual, ...vacacionRevisada },
      },
      transaction,
    );

    await transaction.commit();
    return vacacionRevisada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la revisión de la solicitud de vacaciones:",
        rollbackError,
      );
    }
    throw error;
  }
}

// Para un solo día se puede enviar la misma fecha en ambos extremos.
export async function validarDiasVacaciones(
  colaboradorId,
  fechaInicio,
  fechaFin,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para validar los días de vacaciones.",
      500,
    );
  }

  const id = validateId(colaboradorId, "ColaboradorId");
  const normalizarFecha = (fecha, campo) => {
    if (fecha instanceof Date && Number.isNaN(fecha.getTime())) {
      throw serviceError(`${campo} no es una fecha válida`);
    }
    return validateDate(
      fecha instanceof Date ? fechaSQLComoTexto(fecha) : fecha,
      campo,
    );
  };
  const desde = normalizarFecha(fechaInicio, "Fecha de inicio");
  const hasta = normalizarFecha(fechaFin ?? fechaInicio, "Fecha de fin");

  if (hasta < desde) {
    throw serviceError(
      "La fecha de fin no puede ser anterior a la fecha de inicio.",
    );
  }

  const vacaciones = await vacacionesRepository.getVacacionesSuperpuestas(
    id,
    desde,
    hasta,
    transaction,
  );
  if (vacaciones.some((solicitud) => solicitud.Estado === "APROBADA")) {
    throw serviceError(
      "No se puede realizar esta operación porque las fechas coinciden con vacaciones aprobadas.",
      409,
    );
  }
}

export async function resolverVacacionesRH(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "RECURSOS_HUMANOS") {
    throw serviceError(
      "Solo Recursos Humanos puede resolver solicitudes de vacaciones.",
      403,
    );
  }

  const usuarioActualId = validateId(usuario.UsuarioId, "UsuarioId");
  const id = validateId(solicitudId, "SolicitudId");

  const observacionValidada = validateText(
    datosRevision.observacion,
    "Observación",
    500,
    true,
  );

  const estadoValidado = validateText(
    datosRevision.estado,
    "Estado",
    20,
  ).toUpperCase();

  if (!["RECHAZADA", "APROBADA"].includes(estadoValidado)) {
    throw serviceError("Estado debe ser aprobada o rechazada", 400);
  }

  const transaction = await beginTransaction();

  try {
    const vacacionActual = await vacacionesRepository.getVacacionSolicitudById(
      id,
      transaction,
    );

    if (!vacacionActual)
      throw serviceError("No se encontró la solicitud de vacaciones.", 404);

    if (vacacionActual.Estado !== "EN_REVISION_RH")
      throw serviceError(
        "La solicitud de vacaciones debe estar en revisión de Recursos Humanos.",
        409,
      );

    const vacaciones = await vacacionesRepository.getVacacionesByColaborador(
      vacacionActual.ColaboradorId,
      {},
      transaction,
    );

    const vacacionesPendientes = vacaciones.find(
      (currentVacacion) =>
        currentVacacion.SolicitudId !== id &&
        ["PENDIENTE", "EN_REVISION_RH"].includes(currentVacacion.Estado) &&
        currentVacacion.FechaInicio < vacacionActual.FechaInicio,
    );

    if (vacacionesPendientes) {
      throw serviceError(
        `Debe resolver primero la solicitud ${
          vacacionesPendientes.SolicitudId
        }, correspondiente a una solicitud de vacaciones anterior.`,
        409,
      );
    }

    let vacacionActualizada;
    let registroCalculoCreado = null;

    if (estadoValidado === "RECHAZADA") {
      vacacionActualizada = await resolverSolicitudRh(
        id,
        "VACACIONES",
        {
          estado: estadoValidado,
          observacion: observacionValidada,
          revisadoPorRhId: usuarioActualId,
        },
        transaction,
      );
    } else {
      await bloquearColaboradorSolicitudes(vacacionActual.ColaboradorId, transaction);
      await validarDiasVacaciones(
        vacacionActual.ColaboradorId,
        vacacionActual.FechaInicio,
        vacacionActual.FechaFin,
        transaction,
      );
      const saldoVacacionActual = await saldosRepository.getSaldoByColaborador(
        vacacionActual.ColaboradorId,
        transaction,
      );

      if (!saldoVacacionActual) {
        throw serviceError("El saldo de vacaciones no está inicializado.", 409);
      }

      if (
        Number(saldoVacacionActual.DiasDisponibles) <
        Number(vacacionActual.DiasSolicitados)
      )
        throw serviceError(
          "Los días solicitados superan los días disponibles.",
          409,
        );

      vacacionActualizada = await resolverSolicitudRh(
        id,
        "VACACIONES",
        {
          estado: estadoValidado,
          observacion: observacionValidada,
          revisadoPorRhId: usuarioActualId,
        },
        transaction,
      );
    }

    if (!vacacionActualizada) {
      throw serviceError(
        "No se pudo resolver la solicitud de vacaciones porque su estado cambió durante la operación.",
        409,
      );
    }

    if (estadoValidado === "APROBADA") {
      registroCalculoCreado = await registrarCalculoVacaciones(
        { ...vacacionActual, ...vacacionActualizada },
        transaction,
        usuarioActualId,
      );

      if (!registroCalculoCreado?.length) {
        throw serviceError(
          "No se pudo registrar el cálculo de vacaciones.",
          500,
        );
      }
    }

    const resultado = {
      vacacionActualizada,
      registroCalculoCreado,
    };

    const accionBitacora =
      estadoValidado === "APROBADA"
        ? acciones.APROBAR_VACACIONES
        : acciones.RECHAZAR_VACACIONES;

    await registrarBitacora(
      {
        usuarioId: usuarioActualId,
        entidad: entidades.VACACIONES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: vacacionActual,
        datosNuevos: {
          ...vacacionActual,
          ...vacacionActualizada,
          registroCalculoCreado,
        },
      },
      transaction,
    );

    await transaction.commit();
    return resultado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la revisión de la solicitud de vacaciones:",
        rollbackError,
      );
    }
    throw error;
  }
}

export async function revertirVacaciones(
  solicitudId,
  { motivo } = {},
  usuario,
) {
  if (!["GERENTE", "RECURSOS_HUMANOS"].includes(usuario?.Rol)) {
    throw serviceError(
      "Solo Gerencia y Recursos Humanos pueden revertir vacaciones.",
      403,
    );
  }

  const id = validateId(solicitudId, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const motivoValidado = validateText(motivo, "Motivo de reversión", 500);
  const transaction = await beginTransaction();

  try {
    let solicitudActual = await vacacionesRepository.getVacacionSolicitudById(
      id,
      transaction,
    );
    if (!solicitudActual) {
      throw serviceError("No se encontró la solicitud de vacaciones.", 404);
    }

    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    solicitudActual = await vacacionesRepository.getVacacionSolicitudById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError(
        "La solicitud de vacaciones ya no está disponible.",
        404,
      );
    }

    await validarAccesoSolicitud(
      solicitudActual,
      usuario,
      "Solo podés revertir vacaciones de tu restaurante.",
    );

    let estadoDestino;
    if (usuario.Rol === "GERENTE") {
      const revisadaPorGerente =
        ["EN_REVISION_RH", "RECHAZADA"].includes(solicitudActual.Estado) &&
        solicitudActual.RevisadoPorGerenteId != null &&
        solicitudActual.RevisadoPorRhId == null;
      if (!revisadaPorGerente) {
        throw serviceError(
          "Solo podés deshacer la revisión de Gerencia mientras RH no haya resuelto las vacaciones.",
          409,
        );
      }
      estadoDestino = "PENDIENTE";
    } else {
      const rechazadaPorRh =
        solicitudActual.Estado === "RECHAZADA" &&
        solicitudActual.RevisadoPorGerenteId != null &&
        solicitudActual.RevisadoPorRhId != null;
      if (!rechazadaPorRh) {
        throw serviceError(
          "Por ahora, RH solo puede revertir vacaciones rechazadas por RH; las aprobadas requieren revertir sus cálculos y saldo.",
          409,
        );
      }
      estadoDestino = "EN_REVISION_RH";
    }

    const calculos = await calculosRepository.getCalculosBySolicitud(
      id,
      transaction,
    );

    if (calculos.length > 0) {
      throw serviceError(
        "Esta solicitud tiene cálculos registrados y no admite esta reversión.",
        409,
      );
    }

    const superpuestas = await vacacionesRepository.getVacacionesSuperpuestas(
      solicitudActual.ColaboradorId,
      solicitudActual.FechaInicio,
      solicitudActual.FechaFin,
      transaction,
    );

    if (superpuestas.some((solicitud) => solicitud.SolicitudId !== id)) {
      throw serviceError(
        "Existe otra solicitud de vacaciones pendiente, en revisión o aprobada que coincide con estas fechas.",
        409,
      );
    }

    const cabecera = await revertirSolicitud(
      id,
      "VACACIONES",
      solicitudActual.Estado,
      estadoDestino,
      transaction,
    );
    
    if (!cabecera) {
      throw serviceError(
        "No se pudo revertir la solicitud porque su estado cambió durante la operación.",
        409,
      );
    }
    const solicitudRevertida = { ...solicitudActual, ...cabecera };

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.VACACIONES,
        registroId: id,
        accion: acciones.REVERTIR,
        datosAnteriores: solicitudActual,
        datosNuevos: { ...solicitudRevertida, motivoReversion: motivoValidado },
      },
      transaction,
    );

    await transaction.commit();
    return solicitudRevertida;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo deshacer la reversión de vacaciones:",
        rollbackError,
      );
    }
    throw error;
  }
}
