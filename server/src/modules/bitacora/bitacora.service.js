import { crearBitacora } from "./bitacora.repository.js";

import {
  validateId,
  validateText,
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
  SOLICITUDES_HORAS_EXTRAS: "SolicitudesHorasExtras",
};

export const accionesPermitidas = [
  "CREAR",
  "ACTUALIZAR",
  "ACTIVAR",
  "DESACTIVAR",
  "CAMBIAR_TARIFA",
  "CAMBIAR_CONTRASENA",
  "CAMBIAR_ESTADO",
  "AJUSTAR_HORAS",
  "APROBAR_HORAS_EXTRA",
  "RECHAZAR_HORAS_EXTRA",
];

function validarDatos(datos, nombreCampo) {
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    throw serviceError(
      `El campo ${nombreCampo} debe ser un objeto válido.`,
      400,
    );
  }
  return datos;
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

  if (!accionesPermitidas.includes(accion)) {
    throw serviceError(
      `La acción ${accion} no es válida. Las acciones permitidas son: ${accionesPermitidas.join(", ")}`,
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

  if (accion === "CREAR") {
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
