import * as incapacidadesRepository from "./incapacidades.repository.js";
import * as calculosRepository from "./calculoIncapacidades.repository.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";
import {
  getAsistenciaByColaboradorYFecha,
  updateMinutosAsistencia,
} from "../asistenciasDiarias/asistenciasDiarias.repository.js";
import {
  validateId,
  validateDate,
  validateText,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

import {
  validarAccesoSolicitud,
  validarFiltrosSolicitudes,
  validarRestauranteSolicitudes,
} from "../../shared/utils/solicitudUtils.js";
import { validarDiasVacaciones } from "../vacaciones/services/vacaciones.service.js";

import { getColaborador } from "../colaboradores/colaboradores.service.js";
import { sincronizarHorasExtras } from "../extras/horasExtras.service.js";
import {
  bloquearColaboradorSolicitudes,
  revisarSolicitudGerente,
  resolverSolicitudRh,
  revertirSolicitud,
} from "../solicitudes/solicitudes.repository.js";

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

// CONSULTAS

export async function listarTiposIncapacidad() {
  return await incapacidadesRepository.getTiposIncapacidad();
}

export async function obtenerIncapacidad(solicitudId, usuario) {
  const id = validateId(solicitudId, "SolicitudId");
  const solicitud = await incapacidadesRepository.getSolicitudById(id);

  if (!solicitud) {
    throw serviceError("No se encontró la solicitud de incapacidad.", 404);
  }

  await validarAccesoSolicitud(solicitud, usuario);

  return solicitud;
}

export async function listarMisIncapacidades(usuario, filtros = {}) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");

  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  return await incapacidadesRepository.getIncapacidadesByColaborador(
    colaboradorId,
    filtrosValidados,
  );
}

export async function listarIncapacidadesPorRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  if (!["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario.Rol)) {
    throw serviceError(
      "No tiene permisos para consultar incapacidades por restaurante.",
      403,
    );
  }

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

  return await incapacidadesRepository.getIncapacidadesByRestaurante(
    restauranteConsultaId,
    filtrosValidados,
  );
}

export async function obtenerCalculoIncapacidad(solicitudId, usuario) {
  if (!["RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(usuario.Rol)) {
    throw serviceError(
      "Solo Recursos Humanos y Administración pueden consultar los cálculos de incapacidad.",
      403,
    );
  }

  const idSolicitud = validateId(solicitudId, "SolicitudId");

  const calculoSolicitud =
    await calculosRepository.getCalculoBySolicitud(idSolicitud);

  if (!calculoSolicitud) {
    throw serviceError(
      "La solicitud no tiene un cálculo de incapacidad registrado.",
      404,
    );
  }

  return calculoSolicitud;
}

// CREACIÓN Y REVISIONES
function validarDatosIncapacidad(datos, usuario) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw serviceError(
      "Los datos de la incapacidad deben ser un objeto válido.",
      400,
    );
  }

  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");

  const registradoPorUsuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const fechaInicio = validateDate(datos.fechaInicio, "Fecha de inicio");

  const fechaFin = validateDate(datos.fechaFin, "Fecha de fin");

  if (fechaFin < fechaInicio) {
    throw serviceError(
      "La fecha de fin no puede ser anterior a la fecha de inicio.",
      400,
    );
  }

  return {
    colaboradorId,
    restauranteId: validateId(datos.restauranteId, "RestauranteId"),
    registradoPorUsuarioId,
    motivo: validateText(datos.motivo, "Motivo", 500, true),
    tipoIncapacidadId: validateId(datos.tipoIncapacidadId, "TipoIncapacidadId"),
    numeroDocumento: validateText(
      datos.numeroDocumento,
      "Número de documento",
      50,
    ),
    fechaInicio,
    fechaFin,

    // Estos datos deben provenir del archivo procesado por el servidor.
    comprobanteRuta: validateText(
      datos.comprobanteRuta,
      "Ruta del comprobante",
      500,
    ),
    comprobanteNombre: validateText(
      datos.comprobanteNombre,
      "Nombre del comprobante",
      255,
    ),
  };
}

export async function solicitarIncapacidad(datos, usuario) {
  const datosValidados = validarDatosIncapacidad(datos, usuario);

  const colaborador = await getColaborador(
    datosValidados.colaboradorId,
    usuario,
  );

  if (!colaborador) {
    throw serviceError(
      "No se encontró el colaborador asociado a la solicitud.",
      404,
    );
  }

  if (!colaborador.Activo) {
    throw serviceError(
      "El colaborador está inactivo y no puede registrar solicitudes.",
      409,
    );
  }

  const restauranteId = validateId(colaborador.RestauranteId, "RestauranteId");

  if (datosValidados.restauranteId !== restauranteId) {
    throw serviceError(
      "El restaurante indicado no corresponde al restaurante del colaborador.",
      403,
    );
  }

  const { fechaHoy } = obtenerCalendarioActual();

  if (fechaSQLComoTexto(datosValidados.fechaInicio) > fechaHoy) {
    throw serviceError(
      "La incapacidad debe comenzar hoy o en una fecha anterior.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    await bloquearColaboradorSolicitudes(
      datosValidados.colaboradorId,
      transaction,
    );

    const tipoIncapacidad =
      await incapacidadesRepository.getTipoIncapacidadById(
        datosValidados.tipoIncapacidadId,
        transaction,
      );

    if (!tipoIncapacidad) {
      throw serviceError(
        "No se encontró el tipo de incapacidad seleccionado.",
        404,
      );
    }

    if (!tipoIncapacidad.Activo) {
      throw serviceError(
        "El tipo de incapacidad seleccionado está inactivo.",
        409,
      );
    }

    const incapacidadExistente =
      await incapacidadesRepository.getIncapacidadByNumeroDocumento(
        datosValidados.numeroDocumento,
        transaction,
      );

    if (incapacidadExistente) {
      throw serviceError(
        "Ya existe una solicitud de incapacidad con ese número de documento.",
        409,
      );
    }

    const fechasSuperpuestas =
      await incapacidadesRepository.getIncapacidadesSuperpuestas(
        datosValidados.colaboradorId,
        datosValidados.fechaInicio,
        datosValidados.fechaFin,
        transaction,
      );

    if (fechasSuperpuestas.length > 0) {
      throw serviceError(
        "Las fechas coinciden con otra incapacidad pendiente, en revisión o aprobada.",
        409,
      );
    }

    await validarDiasVacaciones(
      datosValidados.colaboradorId, datosValidados.fechaInicio, datosValidados.fechaFin, transaction,
    );

    const incapacidadCreada = await incapacidadesRepository.createIncapacidad(
      datosValidados,
      transaction,
    );

    if (!incapacidadCreada?.SolicitudId) {
      throw serviceError(
        "No se pudo registrar la solicitud de incapacidad.",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId: datosValidados.registradoPorUsuarioId,
        entidad: entidades.SOLICITUDES_INCAPACIDADES,
        registroId: incapacidadCreada.SolicitudId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: incapacidadCreada,
      },
      transaction,
    );

    await transaction.commit();
    return incapacidadCreada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la creación de la incapacidad:",
        rollbackError,
      );
    }

    throw error;
  }
}

export async function revisarIncapacidadGerente(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "GERENTE") {
    throw serviceError(
      "Solo el gerente puede revisar y enviar incapacidades a Recursos Humanos.",
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
    const solicitudActual = await incapacidadesRepository.getSolicitudById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError("No se encontró la solicitud de incapacidad.", 404);
    }

    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    // Volver a consultar después de obtener el bloqueo.
    const solicitudPendiente = await incapacidadesRepository.getSolicitudById(
      id,
      transaction,
    );

    if (!solicitudPendiente) {
      throw serviceError(
        "La solicitud de incapacidad ya no está disponible.",
        404,
      );
    }

    await validarAccesoSolicitud(
      solicitudPendiente,
      usuario,
      "Solo puede revisar solicitudes de su restaurante asignado.",
    );

    if (solicitudPendiente.Estado !== "PENDIENTE") {
      throw serviceError(
        "La solicitud ya fue revisada y no está pendiente de revisión del gerente.",
        409,
      );
    }

    const incapacidadRevisada = await revisarSolicitudGerente(
      id,
      "INCAPACIDAD",
      {
        estado: estadoValidado,
        observacion: observacionValidada,
        revisadoPorGerenteId: usuarioActualId,
      },
      transaction,
    );

    if (!incapacidadRevisada) {
      throw serviceError(
        "No se pudo revisar la solicitud porque su estado cambió durante la operación.",
        409,
      );
    }

    const accionBitacora =
      estadoValidado === "EN_REVISION_RH"
        ? acciones.APROBAR_REVISION_INCAPACIDAD
        : acciones.RECHAZAR_INCAPACIDAD;

    await registrarBitacora(
      {
        usuarioId: usuarioActualId,
        entidad: entidades.SOLICITUDES_INCAPACIDADES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: solicitudPendiente,
        datosNuevos: { ...solicitudPendiente, ...incapacidadRevisada },
      },
      transaction,
    );

    await transaction.commit();
    return incapacidadRevisada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la revisión de la incapacidad:",
        rollbackError,
      );
    }

    throw error;
  }
}

// PENDIENTE: aprobar o rechazar desde RH.
// Al aprobar, calcular y registrar el reconocimiento.
export async function resolverIncapacidadRh(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "RECURSOS_HUMANOS") {
    throw serviceError(
      "Solo Recursos Humanos puede resolver solicitudes de incapacidad.",
      409,
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
    const incapacidadActual = await incapacidadesRepository.getSolicitudById(
      id,
      transaction,
    );

    if (!incapacidadActual)
      throw serviceError("No existe una incapacidad con este ID", 404);

    if (incapacidadActual.Estado !== "EN_REVISION_RH")
      throw serviceError(
        "La incapacidad debe de ser aprobada por el gerente primero",
        403,
      );

    const incapacidades =
      await incapacidadesRepository.getIncapacidadesByColaborador(
        incapacidadActual.ColaboradorId,
        {},
        transaction,
      );

    const anteriorSinResolver = incapacidades.find(
      (anterior) =>
        anterior.SolicitudId !== id &&
        ["PENDIENTE", "EN_REVISION_RH"].includes(anterior.Estado) &&
        anterior.FechaInicio < incapacidadActual.FechaInicio,
    );

    if (anteriorSinResolver) {
      throw serviceError(
        `Debe resolver primero la solicitud ${
          anteriorSinResolver.SolicitudId
        }, correspondiente a una incapacidad anterior.`,
        409,
      );
    }

    let incapacidadActualizada;
    let registroCalculoCreado = null;
    let reconocimiento = null;

    if (estadoValidado === "RECHAZADA") {
      incapacidadActualizada = await resolverSolicitudRh(
        id,
        "INCAPACIDAD",
        {
          estado: estadoValidado,
          observacion: observacionValidada,
          revisadoPorRhId: usuarioActualId,
        },
        transaction,
      );
    } else {
      await bloquearColaboradorSolicitudes(incapacidadActual.ColaboradorId, transaction);
      await validarDiasVacaciones(
        incapacidadActual.ColaboradorId, incapacidadActual.FechaInicio, incapacidadActual.FechaFin, transaction,
      );
      const tipoIncapacidad =
        await incapacidadesRepository.getTipoIncapacidadById(
          incapacidadActual.TipoIncapacidadId,
          transaction,
        );

      reconocimiento = await calcularReconocimientoIncapacidad(
        incapacidadActual,
        tipoIncapacidad,
        transaction,
      );

      incapacidadActualizada = await resolverSolicitudRh(
        id,
        "INCAPACIDAD",
        {
          estado: estadoValidado,
          observacion: observacionValidada,
          revisadoPorRhId: usuarioActualId,
        },
        transaction,
      );
    }

    if (!incapacidadActualizada) {
      throw serviceError(
        "No se pudo resolver la incapacidad porque su estado cambió durante la operación.",
        409,
      );
    }

    if (estadoValidado === "APROBADA") {
      registroCalculoCreado = await registrarCalculoIncapacidad(
        incapacidadActual,
        reconocimiento,
        transaction,
        usuarioActualId,
      );
    }

    const resultado = {
      incapacidadActualizada,
      registroCalculoCreado,
    };

    const accionBitacora =
      estadoValidado === "APROBADA"
        ? acciones.APROBAR_INCAPACIDAD
        : acciones.RECHAZAR_INCAPACIDAD;

    await registrarBitacora(
      {
        usuarioId: usuarioActualId,
        entidad: entidades.SOLICITUDES_INCAPACIDADES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: incapacidadActual,
        datosNuevos: {
          ...incapacidadActual,
          ...incapacidadActualizada,
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
        "No se pudo revertir la revisión de la incapacidad:",
        rollbackError,
      );
    }
    throw error;
  }
}

// FUNCIONES INTERNAS DEL CÁLCULO
async function calcularReconocimientoIncapacidad(
  incapacidad,
  tipoIncapacidad,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "No se recibió la transacción necesaria para calcular la incapacidad.",
      500,
    );
  }

  if (!incapacidad || !tipoIncapacidad) {
    throw serviceError(
      "Faltan los datos de la incapacidad o de su tipo para realizar el cálculo.",
      500,
    );
  }

  const colaboradorId = validateId(incapacidad.ColaboradorId, "ColaboradorId");

  if (incapacidad.TipoIncapacidadId !== tipoIncapacidad.TipoIncapacidadId) {
    throw serviceError(
      "El tipo consultado no corresponde a la incapacidad.",
      409,
    );
  }

  if (tipoIncapacidad.Codigo !== "ENFERMEDAD_CCSS") {
    throw serviceError(
      "Todavía no está disponible el cálculo para el tipo de incapacidad seleccionado.",
      409,
    );
  }

  const fechaInicio = incapacidad.FechaInicio;
  const fechaFin = incapacidad.FechaFin;

  if (
    !(fechaInicio instanceof Date) ||
    !(fechaFin instanceof Date) ||
    Number.isNaN(fechaInicio.getTime()) ||
    Number.isNaN(fechaFin.getTime())
  ) {
    throw serviceError(
      "Las fechas almacenadas de la incapacidad no son válidas.",
      500,
    );
  }

  if (fechaFin < fechaInicio) {
    throw serviceError(
      "La incapacidad tiene una fecha final anterior a su fecha inicial.",
      409,
    );
  }

  const porcentajePatronal = tipoIncapacidad.PorcentajePatronal;

  if (
    !Number.isFinite(porcentajePatronal) ||
    porcentajePatronal < 0 ||
    porcentajePatronal > 100
  ) {
    throw serviceError(
      "El porcentaje patronal configurado debe ser un número entre 0 y 100.",
      500,
    );
  }

  // Regla definida para el proyecto:
  // hasta tres días reconocidos por ventana fija de treinta días.
  const milisegundosPorDia = 24 * 60 * 60 * 1000;
  const duracionVentanaDias = 30;
  const maximoDiasReconocibles = 3;
  const minutosBaseDiaria = 8 * 60;

  const antecedentes =
    await calculosRepository.getIncapacidadesAprobadasAnteriores(
      colaboradorId,
      fechaInicio,
      transaction,
    );

  const antecedentesEnfermedad = antecedentes.filter(
    (anterior) => anterior.CodigoTipoIncapacidad === "ENFERMEDAD_CCSS",
  );

  antecedentesEnfermedad.sort(
    (a, b) => a.FechaInicio.getTime() - b.FechaInicio.getTime(),
  );

  let inicioVentana = null;
  let diasReconocidosVentana = 0;

  function reconocerDia(dia) {
    const terminoVentana =
      inicioVentana !== null &&
      dia - inicioVentana >= duracionVentanaDias * milisegundosPorDia;

    if (inicioVentana === null || terminoVentana) {
      inicioVentana = dia;
      diasReconocidosVentana = 0;
    }

    if (diasReconocidosVentana >= maximoDiasReconocibles) {
      return false;
    }

    diasReconocidosVentana += 1;
    return true;
  }

  for (const anterior of antecedentesEnfermedad) {
    for (
      let dia = anterior.FechaInicio.getTime();
      dia <= anterior.FechaFin.getTime();
      dia += milisegundosPorDia
    ) {
      reconocerDia(dia);
    }
  }

  let diasReconociblesActuales = 0;
  for (
    let dia = fechaInicio.getTime();
    dia <= fechaFin.getTime();
    dia += milisegundosPorDia
  ) {
    if (reconocerDia(dia)) {
      diasReconociblesActuales += 1;
    }
  }

  const minutosReconocidos = Math.round(
    diasReconociblesActuales * minutosBaseDiaria * (porcentajePatronal / 100),
  );

  return {
    minutosReconocidos,
    porcentajePatronalAplicado: porcentajePatronal,
  };
}

async function registrarCalculoIncapacidad(
  incapacidad,
  reconocimiento,
  transaction,
  usuarioActorId,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para registrar el cálculo de incapacidad.",
      500,
    );
  }

  if (!incapacidad || !reconocimiento) {
    throw serviceError(
      "Faltan los datos necesarios para registrar el cálculo de incapacidad.",
      500,
    );
  }

  const solicitudId = validateId(incapacidad.SolicitudId, "SolicitudId");
  const actorId = validateId(usuarioActorId, "UsuarioId");

  const { minutosReconocidos, porcentajePatronalAplicado } = reconocimiento;

  if (
    !Number.isInteger(minutosReconocidos) ||
    minutosReconocidos < 0 ||
    minutosReconocidos > 2147483647
  ) {
    throw serviceError(
      "El cálculo debe generar minutos reconocidos enteros y no negativos.",
      500,
    );
  }

  if (
    !Number.isFinite(porcentajePatronalAplicado) ||
    porcentajePatronalAplicado < 0 ||
    porcentajePatronalAplicado > 100
  ) {
    throw serviceError(
      "El porcentaje patronal calculado debe estar entre 0 y 100.",
      500,
    );
  }

  // Comprobar el duplicado antes de modificar las horas.
  const calculoExistente = await calculosRepository.getCalculoBySolicitud(
    solicitudId,
    transaction,
  );

  if (calculoExistente) {
    throw serviceError(
      "La solicitud de incapacidad ya tiene un cálculo registrado.",
      409,
    );
  }

  const solicitudActual = await incapacidadesRepository.getSolicitudById(
    solicitudId,
    transaction,
  );

  if (solicitudActual.Estado !== "APROBADA") {
    throw serviceError(
      "La incapacidad debe estar aprobada para registrar su cálculo.",
      409,
    );
  }

  // El reconocimiento se asigna al período de la fecha de aprobación.
  const { fechaAsignada, fechaHoy } = obtenerCalendarioActual();
  const fechaValida = validateDate(fechaAsignada, "Fecha asignada actual");

  const periodoActual = await periodoRepository.getPeriodoByFecha(
    fechaValida,
    transaction,
  );

  if (!periodoActual) {
    throw serviceError(
      "No existe un período de planilla para asignar el reconocimiento.",
      409,
    );
  }

  if (
    periodoActual.Estado !== "ABIERTO" &&
    periodoActual.Estado !== "EN_REVISION"
  ) {
    throw serviceError(
      "El período actual no está abierto y no permite asignar nuevos cálculos de incapacidad.",
      409,
    );
  }

  await invalidarHorasTrabajadasAsistencia(
    solicitudActual,
    transaction,
    fechaHoy,
    actorId,
  );

  const calculoIncapacidadCreado =
    await calculosRepository.createCalculoIncapacidad(
      {
        solicitudId,
        periodoId: periodoActual.PeriodoId,
        minutosReconocidos,
        porcentajePatronalAplicado,
      },
      transaction,
    );

  if (!calculoIncapacidadCreado) {
    throw serviceError("No se pudo registrar el cálculo de incapacidad.", 409);
  }

  return calculoIncapacidadCreado;
}

async function invalidarHorasTrabajadasAsistencia(
  solicitudActual,
  transaction,
  fechaHoy,
  actorId,
) {
  // Buscar la asistencia del primer día de la incapacidad.
  const asistenciaDiariaActual = await getAsistenciaByColaboradorYFecha(
    solicitudActual.ColaboradorId,
    solicitudActual.FechaInicio,
    transaction,
  );

  if (asistenciaDiariaActual) {
    // Este período puede ser diferente al del reconocimiento.
    const periodoAsistencia = await periodoRepository.getPeriodoById(
      asistenciaDiariaActual.PeriodoId,
      transaction,
    );

    const permiteAjustes =
      ["ABIERTO", "EN_REVISION"].includes(periodoAsistencia.Estado) &&
      fechaHoy <= fechaSQLComoTexto(periodoAsistencia.FechaLimiteAjustes);

    // Si el período ya no permite ajustes, las horas quedan intactas.
    if (permiteAjustes) {
      const newAsistencia = await updateMinutosAsistencia(
        asistenciaDiariaActual.AsistenciaId,
        0,
        "Ajustados",
        transaction,
      );

      if (!newAsistencia) {
        throw serviceError(
          "No se pudieron ajustar las horas por incapacidad.",
          409,
        );
      }

      await sincronizarHorasExtras(newAsistencia, actorId, transaction, true);

      await registrarBitacora(
        {
          usuarioId: actorId,
          entidad: entidades.ASISTENCIAS_DIARIAS,
          registroId: asistenciaDiariaActual.AsistenciaId,
          accion: acciones.ACTUALIZAR,

          datosAnteriores: {
            minutosCalculados: asistenciaDiariaActual.MinutosCalculados,
            minutosAjustados: asistenciaDiariaActual.MinutosAjustados,
          },

          datosNuevos: {
            minutosCalculados: newAsistencia.MinutosCalculados,
            minutosAjustados: newAsistencia.MinutosAjustados,
            solicitudId: solicitudActual.SolicitudId,
            motivo: "Horas ajustadas a cero por incapacidad aprobada por RH.",
          },
        },
        transaction,
      );
    }
  }
}

// VALIDACIÓN UTILIZADA POR OTROS MÓDULOS
export async function validarDiaSinIncapacidad(
  colaboradorId,
  fechaAsignada,
  transaction = null,
) {
  if (!transaction) {
    throw serviceError(
      "No se recibió la transacción necesaria para validar la incapacidad del día.",
      500,
    );
  }

  const idColaborador = validateId(colaboradorId, "ColaboradorId");

  // Permite recibir el texto del calendario o un DATE del repositorio.
  const fechaTexto =
    fechaAsignada instanceof Date
      ? fechaSQLComoTexto(fechaAsignada)
      : fechaAsignada;

  const fechaValida = validateDate(fechaTexto, "Fecha asignada");

  const incapacidadConsultada =
    await incapacidadesRepository.getIncapacidadVigenteByFecha(
      idColaborador,
      fechaValida,
      transaction,
    );

  if (incapacidadConsultada) {
    throw serviceError(
      `No se pueden registrar marcas ni modificar horas para el ${fechaTexto}, porque existe una solicitud de incapacidad pendiente, en revisión de RH o aprobada.`,
      409,
    );
  }
}

export async function revertirIncapacidad(
  solicitudId,
  { motivo } = {},
  usuario,
) {
  if (!["GERENTE", "RECURSOS_HUMANOS"].includes(usuario.Rol)) {
    throw serviceError(
      "Solo Gerencia y Recursos Humanos pueden revertir incapacidades.",
      403,
    );
  }

  const id = validateId(solicitudId, "SolicitudId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");
  const motivoValidado = validateText(motivo, "Motivo de reversión", 500);

  const transaction = await beginTransaction();

  try {
    const solicitudActual = await incapacidadesRepository.getSolicitudById(
      id,
      transaction,
    );

    if (!solicitudActual) {
      throw serviceError("No se encontró la solicitud de incapacidad.", 404);
    }

    await validarAccesoSolicitud(
      solicitudActual,
      usuario,
      "Solo podés revertir incapacidades de tu restaurante.",
    );

    let estadoDestino;

    if (usuario.Rol === "GERENTE") {
      const enviadaARh =
        solicitudActual.Estado === "EN_REVISION_RH" &&
        solicitudActual.RevisadoPorGerenteId != null &&
        solicitudActual.RevisadoPorRhId == null;

      const rechazadaPorGerente =
        solicitudActual.Estado === "RECHAZADA" &&
        solicitudActual.RevisadoPorGerenteId != null &&
        solicitudActual.RevisadoPorRhId == null;

      if (!enviadaARh && !rechazadaPorGerente) {
        throw serviceError(
          "Solo podés deshacer la revisión de Gerencia mientras RH no haya resuelto la incapacidad.",
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
          "Por ahora, RH solo puede revertir incapacidades rechazadas por RH.",
          409,
        );
      }

      estadoDestino = "EN_REVISION_RH";
    }

    await bloquearColaboradorSolicitudes(
      solicitudActual.ColaboradorId,
      transaction,
    );

    // No devolver a revisión una solicitud con un cálculo registrado.
    const calculoExistente = await calculosRepository.getCalculoBySolicitud(
      id,
      transaction,
    );

    if (calculoExistente) {
      throw serviceError(
        "Esta incapacidad tiene un cálculo registrado y no admite esta reversión.",
        409,
      );
    }

    // Después del rechazo pudo registrarse otra incapacidad.
    const incapacidadesSuperpuestas =
      await incapacidadesRepository.getIncapacidadesSuperpuestas(
        solicitudActual.ColaboradorId,
        solicitudActual.FechaInicio,
        solicitudActual.FechaFin,
        transaction,
      );

    const existeOtraIncapacidad = incapacidadesSuperpuestas.some(
      (solicitud) => solicitud.SolicitudId !== id,
    );

    if (existeOtraIncapacidad) {
      throw serviceError(
        "Existe otra incapacidad pendiente, en revisión o aprobada que coincide con estas fechas.",
        409,
      );
    }

    await validarDiasVacaciones(
      solicitudActual.ColaboradorId, solicitudActual.FechaInicio, solicitudActual.FechaFin, transaction,
    );
    const cabeceraRevertida = await revertirSolicitud(
      id,
      solicitudActual.TipoSolicitud,
      solicitudActual.Estado,
      estadoDestino,
      transaction,
    );

    if (!cabeceraRevertida) {
      throw serviceError(
        "No se pudo revertir la incapacidad porque su estado cambió durante la operación.",
        409,
      );
    }

    // Recuperar también los datos del detalle de la incapacidad.
    const incapacidadRevertida = await incapacidadesRepository.getSolicitudById(
      id,
      transaction,
    );

    if (!incapacidadRevertida) {
      throw serviceError(
        "No se pudo obtener la incapacidad después de revertirla.",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.SOLICITUDES,
        registroId: id,
        accion: acciones.REVERTIR,
        datosAnteriores: solicitudActual,
        datosNuevos: {
          ...incapacidadRevertida,
          motivoReversion: motivoValidado,
        },
      },
      transaction,
    );

    await transaction.commit();
    return incapacidadRevertida;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo deshacer la reversión de la incapacidad:",
        rollbackError,
      );
    }

    throw error;
  }
}
