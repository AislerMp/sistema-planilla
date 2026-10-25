import * as solicitudesRepository from "../repositories/solicitudDeducciones.repository.js";

import * as deduccionesRepository from "../repositories/deducciones.repository.js";

import {
  validateId,
  validateDate,
  validateText,
  validateNumber,
  serviceError,
} from "../../../shared/utils/serviceUtils.js";

import {
  validarAccesoSolicitud,
  validarFiltrosSolicitudes,
  validarRestauranteSolicitudes,
} from "../../../shared/utils/solicitudUtils.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../../shared/utils/fechaUtils.js";

import { getColaborador } from "../../colaboradores/colaboradores.service.js";

import { bloquearColaboradorSolicitudes } from "../../solicitudes/solicitudes.repository.js";

import { beginTransaction } from "../../../shared/config/database.js";

import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";

// Consultar una solicitud y comprobar el acceso.
export async function obtenerSolicitud(solicitudId, usuario) {
  const id = validateId(solicitudId, "El ID de la solicitud no es válido.");
  const solicitud = await solicitudesRepository.getSolicitudById(id);

  if (!solicitud) {
    throw serviceError("Solicitud no encontrada.", 404);
  }

  await validarAccesoSolicitud(solicitud, usuario);

  return solicitud;
}

// Consultar las solicitudes del colaborador autenticado.
export async function listarMisSolicitudes(usuario, filtros = {}) {
  const filtrosValidados = await validarFiltrosSolicitudes(filtros);
  return await solicitudesRepository.getSolicitudesByColaborador(
    usuario.ColaboradorId,
    filtrosValidados,
  );
}

// Consulta de Recursos Humanos por restaurante.
export async function listarSolicitudesPorRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  const restauranteSolicitado = validateId(
    restauranteId,
    "RestauranteId",
    true,
  );
  const filtrosValidados = await validarFiltrosSolicitudes(filtros);

  const restauranteConsultaId =
    usuario.Rol !== "GERENTE" && restauranteSolicitado === null
      ? null
      : await validarRestauranteSolicitudes(restauranteSolicitado, usuario);

  return await solicitudesRepository.getSolicitudesByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

// Crear la cabecera y el detalle de la solicitud.
export async function solicitarDeduccion(datos, usuario) {
  const colaboradorActual = await getColaborador(
    validateId(usuario.ColaboradorId, "ColaboradorId"),
    usuario,
  );

  if (!colaboradorActual.Activo) {
    throw serviceError("El colaborador no está activo.", 403);
  }

  const datosValidados = {
    deduccionId: validateId(
      datos.deduccionId,
      "El ID de la deducción no es válido.",
    ),
    porcentajeSolicitado: await validateNumber(
      datos.porcentajeSolicitado,
      "Porcentaje solicitado",
    ),
    fechaInicio: validateDate(
      datos.fechaInicio,
      "La fecha de inicio no es válida.",
    ),
    fechaFin: validateDate(
      datos.fechaFin,
      "La fecha de fin no es válida.",
      true,
    ),
    autorizacion: true,
    motivo: validateText(datos.motivo, "El motivo no es válido.", 500, true),
  };

  if (
    datosValidados.fechaFin &&
    datosValidados.fechaFin < datosValidados.fechaInicio
  ) {
    throw serviceError(
      "La fecha de fin no puede ser anterior a la fecha de inicio.",
      400,
    );
  }
  if (
    datosValidados.porcentajeSolicitado <= 0 ||
    datosValidados.porcentajeSolicitado > 20
  ) {
    throw serviceError(
      "El porcentaje solicitado debe estar entre 1 y 20.",
      400,
    );
  }

  let { fechaHoy } = obtenerCalendarioActual();
  fechaHoy = new Date(fechaHoy);

  if (datosValidados.fechaInicio && datosValidados.fechaInicio < fechaHoy) {
    throw serviceError(
      "La fecha de inicio no puede ser anterior a la fecha de hoy.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    await bloquearColaboradorSolicitudes(colaboradorActual.ColaboradorId, transaction);

    const deduccion = await deduccionesRepository.getDeduccionById(
      datosValidados.deduccionId,
      transaction,
    );
    if (!deduccion) {
      throw serviceError("La deducción solicitada no existe.", 404);
    }

    if (deduccion.TipoDeduccion !== "ADICIONAL") {
      throw serviceError(
        "Solo se pueden solicitar deducciones adicionales.",
        400,
      );
    }

    const solicitudesSuperpuestas =
      await solicitudesRepository.getSolicitudesSuperpuestas(
        colaboradorActual.ColaboradorId,
        deduccion.Codigo,
        datosValidados.fechaInicio,
        datosValidados.fechaFin,
        transaction,
      );

    if (solicitudesSuperpuestas.length > 0) {
      throw serviceError(
        "Ya existe una solicitud superpuesta para este colaborador y deducción.",
        400,
      );
    }

    const nuevaSolicitud = await solicitudesRepository.createSolicitud(
      {
        ...datosValidados,
        colaboradorId: colaboradorActual.ColaboradorId,
        restauranteId: colaboradorActual.RestauranteId,
        registradoPorUsuarioId: usuario.UsuarioId,
      },
      transaction,
    );

    if (!nuevaSolicitud) {
      throw serviceError("No se pudo crear la solicitud de deducción.", 500);
    }

    await registrarBitacora(
      {
        usuarioId: usuario.UsuarioId,
        entidad: entidades.SOLICITUDES_DEDUCCIONES,
        accion: acciones.CREAR,
        registroId: nuevaSolicitud.SolicitudId,
        datosNuevos: nuevaSolicitud,
        datosAnteriores: null,
      },
      transaction,
    );

    await transaction.commit();

    return nuevaSolicitud;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Error al revertir la transacción:", rollbackError);
    }
    throw error;
  }
}

// Aprobar o rechazar directamente desde PENDIENTE.
export async function resolverSolicitud(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "RECURSOS_HUMANOS") {
    throw serviceError(
      "Solo Recursos Humanos puede resolver solicitudes de deducciones.",
      403,
    );
  }

  const id = validateId(solicitudId, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const estado = validateText(
    datosRevision.estado,
    "Estado",
    20,
  ).toUpperCase();

  const observacion = validateText(
    datosRevision.observacion,
    "Observación",
    500,
    true,
  );

  if (!["APROBADA", "RECHAZADA"].includes(estado)) {
    throw serviceError(
      "El estado debe ser APROBADA o RECHAZADA.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    let solicitudActual =
      await solicitudesRepository.getSolicitudById(
        id,
        transaction,
      );

    if (!solicitudActual) {
      throw serviceError(
        "No se encontró la solicitud de deducción.",
        404,
      );
    }

    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    // Otra operación pudo resolverla mientras esperábamos el bloqueo.
    solicitudActual =
      await solicitudesRepository.getSolicitudById(
        id,
        transaction,
      );

    if (
      !solicitudActual ||
      solicitudActual.Estado !== "PENDIENTE"
    ) {
      throw serviceError(
        "La solicitud ya no está pendiente y no puede resolverse nuevamente.",
        409,
      );
    }

    if (estado === "APROBADA") {
      const colaborador = await getColaborador(
        solicitudActual.ColaboradorId,
        usuario,
      );

      if (!colaborador) {
        throw serviceError(
          "No se encontró el colaborador de la solicitud.",
          404,
        );
      }

      if (!colaborador.Activo) {
        throw serviceError(
          "No se puede aprobar una deducción para un colaborador inactivo.",
          409,
        );
      }

      const deduccion =
        await deduccionesRepository.getDeduccionById(
          solicitudActual.DeduccionId,
          transaction,
        );

      if (!deduccion) {
        throw serviceError(
          "No se encontró la deducción solicitada.",
          404,
        );
      }

      if (deduccion.TipoDeduccion !== "ADICIONAL") {
        throw serviceError(
          "Solo se pueden aprobar solicitudes de deducciones adicionales.",
          409,
        );
      }

      const { fechaHoy } = obtenerCalendarioActual();

      const fechaInicio = fechaSQLComoTexto(
        solicitudActual.FechaInicio,
      );

      const fechaFin = solicitudActual.FechaFin
        ? fechaSQLComoTexto(solicitudActual.FechaFin)
        : null;

      const inicioVigencia = fechaSQLComoTexto(
        deduccion.FechaVigenciaInicio,
      );

      const finVigencia = deduccion.FechaVigenciaFin
        ? fechaSQLComoTexto(deduccion.FechaVigenciaFin)
        : null;

      if (fechaInicio < fechaHoy) {
        throw serviceError(
          "No se puede aprobar la solicitud porque su fecha de inicio ya pasó.",
          409,
        );
      }

      if (fechaInicio < inicioVigencia) {
        throw serviceError(
          "La solicitud comienza antes de la vigencia de la deducción.",
          409,
        );
      }

      if (
        finVigencia &&
        (
          !fechaFin ||
          fechaFin > finVigencia ||
          fechaInicio > finVigencia
        )
      ) {
        throw serviceError(
          "La solicitud debe tener una fecha final y sus fechas deben quedar dentro de la vigencia de la deducción.",
          409,
        );
      }
    }

    const solicitudResuelta =
      await solicitudesRepository.resolverSolicitudRh(
        id,
        {
          estado,
          revisadoPorRhId: usuarioId,
          observacion,
        },
        transaction,
      );

    if (!solicitudResuelta) {
      throw serviceError(
        "No se pudo resolver la solicitud porque su estado cambió durante la operación.",
        409,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES_DEDUCCIONES,
        registroId: id,
        accion:
          estado === "APROBADA"
            ? acciones.APROBAR_DEDUCCION
            : acciones.RECHAZAR_DEDUCCION,
        datosAnteriores: solicitudActual,
        datosNuevos: solicitudResuelta,
      },
      transaction,
    );

    await transaction.commit();

    return solicitudResuelta;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la resolución de la solicitud de deducción:",
        rollbackError,
      );
    }

    throw error;
  }
}
