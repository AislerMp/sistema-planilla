import { crearBitacora, getBitacoras, getBitacoraById } from "./bitacora.repository.js";

import {
  validateId,
  validateText,
  validateDate,
  serviceError,
} from "../../shared/utils/serviceUtils.js";

export const entidades = {
  RESTAURANTE: "Restaurantes",
  USUARIOS: "Usuarios",
  PUESTOS: "Puestos",
  COLABORADORES: "Colaboradores",
  PERIODOS_PLANILLA: "PeriodosPlanilla",
  ASISTENCIAS_DIARIAS: "AsistenciasDiarias",
  HORAS_EXTRAS: "HorasExtras",
  SOLICITUDES: "Solicitudes",
  // Se conservan para consultar bitácoras anteriores a la migración 005.
  SOLICITUDES_HORAS_EXTRAS: "SolicitudesHorasExtras",
  SOLICITUDES_PERMISOS_LABORALES: "SolicitudesPermisosLaborales",
  SOLICITUDES_INCAPACIDADES: "SolicitudesIncapacidades",
};

export const acciones = {
  CREAR: "CREAR",
  ACTUALIZAR: "ACTUALIZAR",
  ACTIVAR: "ACTIVAR",
  DESACTIVAR: "DESACTIVAR",
  CAMBIAR_TARIFA: "CAMBIAR_TARIFA",
  CAMBIAR_CONTRASENA: "CAMBIAR_CONTRASENA",
  CAMBIAR_ESTADO: "CAMBIAR_ESTADO",
  AJUSTAR_HORAS: "AJUSTAR_HORAS",
  APROBAR_HORAS_EXTRA: "APROBAR_HORAS_EXTRA",
  RECHAZAR_HORAS_EXTRA: "RECHAZAR_HORAS_EXTRA",
  APROBAR_PERMISO_LABORAL: "APROBAR_PERMISO_LABORAL",
  RECHAZAR_PERMISO_LABORAL: "RECHAZAR_PERMISO_LABORAL",
  APROBAR_REVISION_INCAPACIDAD: "APROBAR_REVISION_INCAPACIDAD",
  APROBAR_INCAPACIDAD: "APROBAR_INCAPACIDAD",
  RECHAZAR_INCAPACIDAD: "RECHAZAR_INCAPACIDAD",
};

function validarDatos(datos, nombreCampo) {
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    throw serviceError(
      `El campo ${nombreCampo} debe ser un objeto válido.`,
      400,
    );
  }
  return datos;
}

export async function listarBitacoras(filtros = {}) {
  const pagina = validateId(filtros.pagina, "Página", true) ?? 1;
  const usuarioId = validateId(filtros.usuarioId, "UsuarioId", true);
  const registroId = validateId(filtros.registroId, "RegistroId", true);
  const entidad = validateText(filtros.entidad, "Entidad", 50, true);
  const accion = validateText(filtros.accion, "Acción", 30, true);
  const desde = validateDate(filtros.desde, "Fecha desde", true);
  const hasta = validateDate(filtros.hasta, "Fecha hasta", true);

  if (entidad && !Object.values(entidades).includes(entidad)) {
    throw serviceError("La entidad no es válida.");
  }
  if (accion && !Object.values(acciones).includes(accion)) {
    throw serviceError("La acción no es válida.");
  }
  if (desde && hasta && desde > hasta) {
    throw serviceError("La fecha desde no puede ser mayor que la fecha hasta.");
  }

  // Medianoche de Costa Rica corresponde a las 06:00 UTC.
  // Hasta excluye la medianoche siguiente para incluir el día completo.
  if (desde) desde.setUTCHours(6);
  if (hasta) {
    hasta.setUTCDate(hasta.getUTCDate() + 1);
    hasta.setUTCHours(6);
    if (hasta.getUTCFullYear() > 9999) throw serviceError("Fecha hasta fuera de rango.");
  }

  return getBitacoras({ pagina, usuarioId, registroId, entidad, accion, desde, hasta });
}

export async function obtenerBitacora(id) {
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    (typeof id === "number" && !Number.isSafeInteger(id))
  ) {
    throw serviceError(
      "El identificador de la bitácora no es válido.",
      400,
    );
  }

  const idTexto = String(id).trim();
  if (!/^\d{1,19}$/.test(idTexto)) {
    throw serviceError("El identificador de la bitácora no es válido.", 400);
  }
  const idNumerico = BigInt(idTexto);

  // Rango positivo permitido por BIGINT de SQL Server.
  if (idNumerico < 1n || idNumerico > 9223372036854775807n) {
    throw serviceError(
      "El identificador de la bitácora está fuera del rango permitido.",
      400,
    );
  }

  // Lo enviamos como texto para conservar todos sus dígitos.
  const bitacora = await getBitacoraById(idNumerico.toString());

  if (!bitacora) {
    throw serviceError("Bitácora no encontrada.", 404);
  }

  return {
    ...bitacora,
    DatosAnteriores:
      bitacora.DatosAnteriores === null
        ? null
        : JSON.parse(bitacora.DatosAnteriores),
    DatosNuevos: JSON.parse(bitacora.DatosNuevos),
  };
}

export async function registrarBitacora(bitacora, transaction = null) {
  if (!transaction) {
    throw serviceError(
      "La transacción es obligatoria para registrar en la bitácora.",
      400,
    );
  }

  const usuarioId = validateId(bitacora.usuarioId, "UsuarioId");
  const entidad = validateText(bitacora.entidad, "Entidad", 50);
  const registroId = validateId(bitacora.registroId, "RegistroId");
  const accion = validateText(bitacora.accion, "Accion", 30);

  if (!Object.values(acciones).includes(accion)) {
    throw serviceError(
      `La acción ${accion} no es válida. Las acciones permitidas son: ${Object.values(acciones).join(", ")}`,
      400,
    );
  }

  if (!Object.values(entidades).includes(entidad))
    throw serviceError(
      `La entidad ${entidad} no es válida. Las entidades permitidas son: ${Object.values(entidades).join(", ")}`,
      400,
    );

  const datosNuevos = validarDatos(bitacora.datosNuevos, "DatosNuevos");

  let datosAnteriores = null;

  if (accion === acciones.CREAR) {
    if (bitacora.datosAnteriores != null) {
      throw serviceError("Una creación no debe incluir datos anteriores", 400);
    }
  } else {
    datosAnteriores = validarDatos(bitacora.datosAnteriores, "DatosAnteriores");
  }

  const bitacoraData = {
    usuarioId,
    entidad,
    registroId,
    accion,
    datosNuevos,
    datosAnteriores,
  };

  const isRegistrado = await crearBitacora(bitacoraData, transaction);

  if (!isRegistrado) {
    throw serviceError("No se pudo registrar la bitácora", 500);
  }
  return isRegistrado;
}
