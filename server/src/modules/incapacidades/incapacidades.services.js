import * as incapacidadesRepository from "./incapacidades.repository.js";
import * as calculosRepository from "./calculoIncapacidades.repository.js";
import * as periodoRepository from "../periodoPlanilla/periodosPlanillas.repository.js";
import * as solicitudesRepository from "../solicitudes/solicitudes.repository.js";
import {
  validateId,
  validateDate,
  validateText,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

import {
  validarAccesoSolicitud,
  validarFiltrosSolicitudes,
  validarEstadoResolucion,
} from "../../shared/utils/solicitudUtils.js";

import {
  getColaborador,
  getRestaurantePermitido,
} from "../colaboradores/colaboradores.service.js";

import { bloquearColaboradorSolicitudes } from "../solicitudes/solicitudes.repository.js";

import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../shared/config/database.js";

import { registrarBitacora, entidades } from "../bitacora/bitacora.service.js";

// CONSULTAS

// Tipos activos para el formulario.
export async function listarTiposIncapacidad() {
  const tipos = await incapacidadesRepository.getTiposIncapacidad();
  return tipos;
}

// Detalle de la solicitud, validando el acceso del usuario.
export async function obtenerIncapacidad(solicitudId, usuario) {
  validateId(solicitudId, "SolicitudId");

  const solicitud =
    await incapacidadesRepository.getSolicitudIncapacidad(solicitudId);

  await validarAccesoSolicitud(solicitud, usuario);

  return solicitud;
}

// Solicitudes del colaborador que inició sesión.
export async function listarMisIncapacidades(usuario, filtros = {}) {
  const colaboradorId = validateId(usuario.ColaboradorId, "ColaboradorId");
  const filtrosValidados = validarFiltrosSolicitudes(filtros);

  return await incapacidadesRepository.getIncapacidadesByColaborador(
    colaboradorId,
    filtrosValidados,
  );
}

// Solicitudes del restaurante, según el acceso del usuario.
export async function listarIncapacidadesPorRestaurante(
  usuario,
  restauranteId,
  filtros = {},
) {
  const restauranteSolicitado = validateId(restauranteId, "RestauranteId");
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

// Cálculo de una solicitud, validando primero el acceso a ella.
export async function obtenerCalculoIncapacidad(solicitudId, usuario) {
  if (usuario.Rol === "COLABORADOR" || usuario.Rol === "GERENTE") {
    throw serviceError(
      "No tiene permisos para consultar el cálculo de esta solicitud",
      403,
    );
  }

  const idSolicitud = validateId(solicitudId, "SolicitudId");

  const calculoSolicitud =
    await calculosRepository.getCalculoBySolicitud(idSolicitud);

  if (!calculoSolicitud) {
    throw serviceError(
      "No se encontró el cálculo de incapacidad solicitado",
      404,
    );
  }

  return calculoSolicitud;
}

// CREACIÓN Y REVISIONES

function validarDatosIncapacidad(datos, usuario) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw serviceError("Los datos de la incapacidad deben ser un objeto");
  }

  const colaboradorId = validateId(usuario?.ColaboradorId, "ColaboradorId");
  const registradoPorUsuarioId = validateId(usuario?.UsuarioId, "UsuarioId");
  const fechaInicio = validateDate(datos.fechaInicio, "Fecha de inicio");
  const fechaFin = validateDate(datos.fechaFin, "Fecha de fin");

  if (fechaFin < fechaInicio) {
    throw serviceError(
      "La fecha de fin no puede ser anterior a la fecha de inicio",
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

// Recibe los datos y la información del comprobante ya subido.
export async function solicitarIncapacidad(datos, usuario) {
  const datosValidados = validarDatosIncapacidad(datos, usuario);

  const colaborador = await getColaborador(
    datosValidados.colaboradorId,
    usuario,
  );

  const restauranteId = validateId(colaborador.RestauranteId, "RestauranteId");

  if (datosValidados.restauranteId !== restauranteId) {
    throw serviceError(
      "El restaurante indicado no corresponde al colaborador",
      403,
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
    if (!tipoIncapacidad || !tipoIncapacidad.Activo) {
      throw serviceError(
        "El tipo de incapacidad no existe o está inactivo",
        404,
      );
    }

    const incapacidadExistente =
      await incapacidadesRepository.getIncapacidadByNumeroDocumento(
        datosValidados.numeroDocumento,
        transaction,
      );
    if (incapacidadExistente) {
      throw serviceError(
        "Ya existe una incapacidad con el número de documento indicado",
        409,
      );
    }

    const fechasSuperponen =
      await incapacidadesRepository.getIncapacidadesSuperpuestas(
        datosValidados.colaboradorId,
        datosValidados.fechaInicio,
        datosValidados.fechaFin,
        transaction,
      );
    if (fechasSuperponen.length > 0) {
      throw serviceError(
        "El colaborador ya tiene una incapacidad que se superpone con esas fechas",
        409,
      );
    }

    const incapacidadCreada = await incapacidadesRepository.createIncapacidad(
      datosValidados,
      transaction,
    );

    if (!incapacidadCreada?.SolicitudId) {
      throw serviceError("No se pudo crear la solicitud de incapacidad", 500);
    }

    await registrarBitacora(
      {
        usuarioId: datosValidados.registradoPorUsuarioId,
        entidad: entidades.SOLICITUDES_INCAPACIDADES,
        registroId: incapacidadCreada.SolicitudId,
        accion: "CREAR",
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
        "No se pudo revertir la creación de la incapacidad",
        rollbackError,
      );
    }
    throw error;
  }
}

// Gerente: enviar a RH o rechazar.
export async function revisarIncapacidadGerente(
  solicitudId,
  datosRevision = {},
  usuario,
) {
  if (usuario.Rol !== "GERENTE")
    throw serviceError("Solo el gerente tiene permitido esta accion");

  const usuarioActualId = validateId(usuario.UsuarioId, "UsuarioId");
  const usuarioGerenteId = validateId(datosRevision.revisadoPorGerenteId, "");

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
    15,
  ).toUpperCase();

  if (!["RECHAZADA", "EN_REVISION_RH"].includes(estadoValidado))
    throw serviceError("Estado debe ser Rechazado o en revision");

  const solicitudActual = await incapacidadesRepository.getSolicitudById(id);
  if (!solicitudActual) throw serviceError("No encontrado");

  if (usuarioActualId !== usuarioGerenteId) throw serviceError("");

  await validarAccesoSolicitud(
    solicitudActual,
    usuario,
    "Solo podés resolver solicitudes de tu restaurante",
  );

  validarSolicitudPendiente(solicitudActual);

  const transaction = beginTransaction();
  const accionBitacora =
    estadoValidado === "EN_REVISION_RH"
      ? "APROBAR_REVISION_INCAPACIDAD"
      : "RECHAZAR_INCAPACIDAD";

  try {
    const incapacidadRevisada =
      await incapacidadesRepository.revisarIncapacidadGerente(
        id,
        {
          estado: estadoValidado,
          observacion: observacionValidada,
          revisadoPorGerenteId: usuarioGerenteId,
        },
        transaction,
      );

    if (!incapacidadRevisada) throw serviceError("Error en algo", 500);

    await registrarBitacora(
      {
        usuarioActualId,
        entidad: entidades.SOLICITUDES_INCAPACIDADES,
        registroId: id,
        accion: accionBitacora,
        datosAnteriores: solicitudActual,
        datosNuevos: incapacidadRevisada,
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
        "No se pudo revertir la creación de la incapacidad",
        rollbackError,
      );
    }
    throw error;
  }
}

// RH: aprobar o rechazar.
// Al aprobar, calcula y registra el reconocimiento automáticamente.
export async function resolverIncapacidadRh(
  solicitudId,
  datosRevision = {},
  usuario,
) {}

// FUNCIONES INTERNAS DEL MÓDULO

// Consulta antecedentes y calcula el reconocimiento.
// No guarda datos ni confirma la transacción.
async function calcularReconocimientoIncapacidad(
  incapacidad,
  tipoIncapacidad,
  transaction,
) {}

// Obtiene el período actual y guarda el cálculo.
// La llama resolverIncapacidadRh dentro de su transacción.
async function registrarCalculoIncapacidad(
  incapacidad,
  reconocimiento,
  transaction,
) {}

// VALIDACIÓN UTILIZADA POR OTROS MÓDULOS

// Bloquea marcas y ajustes en días con incapacidad aprobada.
export async function validarDiaSinIncapacidadAprobada(
  colaboradorId,
  fechaAsignada,
  transaction = null,
) {
  const idColaborador = validateId(colaboradorId, "ColaboradorId");
  const fechaValida = validateDate(fechaAsignada, "FechaAsignada");

  if (!transaction)
    throw serviceError(
      "Debe proporcionarse una transacción para validar el día sin permiso aprobado",
      500,
    );

  const incapacidadConsultada =
    await incapacidadesRepository.getIncapacidadAprobadaByFecha(
      idColaborador,
      fechaValida,
      transaction,
    );

  if (incapacidadConsultada) {
    throw serviceError(
      `El colaborador tiene una incapacidad aprobada en la fecha ${fechaSQLComoTexto(
        fechaValida,
      )}`,
      409,
    );
  }
}
