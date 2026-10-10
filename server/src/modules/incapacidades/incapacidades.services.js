import * as incapacidadesRepository from "./incapacidades.repository.js";
import * as calculosRepository from "./calculoIncapacidades.repository.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";

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

import { getColaborador } from "../colaboradores/colaboradores.service.js";

import { bloquearColaboradorSolicitudes } from "../solicitudes/solicitudes.repository.js";

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

  const restauranteConsultaId = await validarRestauranteSolicitudes(
    restauranteSolicitado,
    usuario,
  );

  // El repositorio actual consulta un restaurante específico.
  if (restauranteConsultaId === null || restauranteConsultaId === undefined) {
    throw serviceError("Debe indicar el restaurante que desea consultar.", 400);
  }

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

    const incapacidadRevisada =
      await incapacidadesRepository.revisarIncapacidadGerente(
        id,
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
      incapacidadActualizada =
        await incapacidadesRepository.resolverIncapacidadRh(
          id,
          {
            estado: estadoValidado,
            observacion: observacionValidada,
            revisadoPorRhId: usuarioActualId,
          },
          transaction,
        );
    } else {
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

      incapacidadActualizada =
        await incapacidadesRepository.resolverIncapacidadRh(
          id,
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
) {
  if (!transaction) {
    throw serviceError(
      "No se recibió la transacción necesaria para registrar el cálculo.",
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

  const { minutosReconocidos, porcentajePatronalAplicado } = reconocimiento;

  if (
    !Number.isInteger(minutosReconocidos) ||
    minutosReconocidos < 0 ||
    minutosReconocidos > 2147483647
  ) {
    throw serviceError(
      "El cálculo debe generar minutos reconocidos enteros, no negativos y dentro del rango permitido.",
      500,
    );
  }

  if (
    !Number.isFinite(porcentajePatronalAplicado) ||
    porcentajePatronalAplicado < 0 ||
    porcentajePatronalAplicado > 100
  ) {
    throw serviceError(
      "El cálculo debe generar un porcentaje patronal entre 0 y 100.",
      500,
    );
  }

  const { fechaAsignada } = obtenerCalendarioActual();
  const fechaValida = validateDate(fechaAsignada, "Fecha asignada actual");

  const periodoActual = await periodoRepository.getPeriodoByFecha(
    fechaValida,
    transaction,
  );

  if (!periodoActual) {
    throw serviceError(
      "No existe un período de planilla para asignar el reconocimiento de la incapacidad.",
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
    throw serviceError(
      "No se pudo registrar el cálculo. La solicitud debe existir y estar aprobada.",
      409,
    );
  }

  return calculoIncapacidadCreado;
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
