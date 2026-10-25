import * as deduccionesRepository from "../repositories/deducciones.repository.js";

import {
  validateId,
  validateDate,
  validateText,
  serviceError,
  validateNumber,
} from "../../../shared/utils/serviceUtils.js";

import { obtenerCalendarioActual } from "../../../shared/utils/fechaUtils.js";

import { beginTransaction } from "../../../shared/config/database.js";

import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";

async function validarFiltrosDeducciones(filtros = {}) {
  const tipoDeduccion = validateText(
    filtros.tipoDeduccion,
    "Tipo de deducción",
    15,
    true,
  )?.toUpperCase() ?? null;

  const codigo = validateText(
    filtros.codigo,
    "Código",
    50,
    true,
  )?.toUpperCase() ?? null;

  const fechaVigencia = validateDate(
    filtros.fechaVigencia,
    "Fecha de vigencia",
    true,
  );

  if (
    tipoDeduccion &&
    !["LEGAL", "ADICIONAL"].includes(tipoDeduccion)
  ) {
    throw serviceError("El tipo de deducción no es válido.", 400);
  }

  return {
    tipoDeduccion,
    codigo,
    fechaVigencia,
  };
}


export async function getDeduccionesService(filtros) {
  const filtrosValidados = await validarFiltrosDeducciones(filtros);
  return await deduccionesRepository.getDeducciones(filtrosValidados);
}

export async function obtenerDeduccionById(deduccionId, usuario) {
  const id = validateId(deduccionId, "El ID de la deducción no es válido.");
  const deduccion = await deduccionesRepository.getDeduccionById(id);

  if (!deduccion) {
    throw serviceError("Deducción no encontrada.", 404);
  }
  return deduccion;
}

export async function crearDeduccion(datos, usuario) {
  if (usuario?.Rol !== "ADMINISTRADOR") {
    throw serviceError("Solo Administración puede crear deducciones.", 403);
  }

  // Validar los datos de la deducción antes de crearla
  const datosValidados = {
    tipoDeduccion: validateText(
      datos.tipoDeduccion,
      "El tipo de deducción no es válido.",
      15,
    ).toUpperCase(),

    codigo: validateText(
      datos.codigo,
      "El código de la deducción no es válido.",
      50,
    ).toUpperCase(),

    nombre: validateText(
      datos.nombre,
      "El nombre de la deducción no es válido.",
      100,
    ),

    entidadReceptora: validateText(
      datos.entidadReceptora,
      "La entidad receptora de la deducción no es válida.",
      100,
      true,
    ),

    porcentaje: await validateNumber(
      datos.porcentaje,
      "El porcentaje de la deducción no es válido.",
      true,
    ),
    fechaVigenciaInicio: validateDate(
      datos.fechaVigenciaInicio,
      "La fecha de inicio de la deducción no es válida.",
    ),
    fechaVigenciaFin: validateDate(
      datos.fechaVigenciaFin,
      "La fecha de fin de la deducción no es válida.",
      true,
    ),
  };
  const usuarioId = validateId(usuario?.UsuarioId, "UsuarioId");

  if (!["LEGAL", "ADICIONAL"].includes(datosValidados.tipoDeduccion)) {
    throw serviceError("El tipo de deducción no es válido.", 400);
  }

  const { fechaHoy } = obtenerCalendarioActual();
  const hoy = validateDate(fechaHoy, "Fecha actual");

  if (datosValidados.fechaVigenciaInicio < hoy) {
    throw serviceError(
      "La vigencia debe comenzar hoy o en una fecha futura.",
      400,
    );
  }

  if (
    datosValidados.fechaVigenciaFin &&
    datosValidados.fechaVigenciaFin < datosValidados.fechaVigenciaInicio
  ) {
    throw serviceError("El fin de vigencia no puede ser anterior al inicio.", 400);
  }

  if (
    datosValidados.tipoDeduccion === "LEGAL" &&
    (datosValidados.porcentaje === null ||
      datosValidados.porcentaje <= 0 ||
      datosValidados.porcentaje > 100 ||
      Number(datosValidados.porcentaje.toFixed(2)) !== datosValidados.porcentaje)
  ) {
    throw serviceError(
      "El porcentaje de una deducción legal debe ser mayor que 0, no superar 100 y tener hasta dos decimales.",
      400,
    );
  }

  if (
    datosValidados.tipoDeduccion === "ADICIONAL" &&
    datosValidados.porcentaje !== null
  ) {
    throw serviceError(
      "No se puede crear una deducción adicional con un porcentaje definido.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    const duplicado = await deduccionesRepository.existeNombreOCodigo(
      datosValidados.nombre,
      datosValidados.codigo,
      transaction,
    );

    if (duplicado?.CodigoDuplicado) {
      throw serviceError("Ya existe una deducción con ese código.", 409);
    }
    if (duplicado?.NombreDuplicado) {
      throw serviceError("Ya existe una deducción con ese nombre.", 409);
    }

    const deduccionCreada = await deduccionesRepository.createDeduccion(
      datosValidados,
      transaction,
    );

    if (!deduccionCreada) {
      throw serviceError("No se pudo crear la deducción.", 500);
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.DEDUCCIONES,
        registroId: deduccionCreada.DeduccionId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: deduccionCreada,
      },
      transaction,
    );

    await transaction.commit();
    return deduccionCreada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la creación de la deducción:",
        rollbackError,
      );
    }

    throw error;
  }
}

export async function actualizarDatosDeduccion(
  deduccionId,
  datos = {},
  usuario,
) {
  if (usuario.Rol !== "ADMINISTRADOR") {
    throw serviceError(
      "Solo Administración puede modificar deducciones.",
      403,
    );
  }

  const id = validateId(deduccionId, "DeduccionId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const transaction = await beginTransaction();

  try {
    const deduccionActual = await deduccionesRepository.getDeduccionById(
      id,
      transaction,
    );

    if (!deduccionActual) {
      throw serviceError("No se encontró la deducción seleccionada.", 404);
    }

    const nombre =
      datos.nombre === undefined
        ? deduccionActual.Nombre
        : validateText(datos.nombre, "Nombre", 100);

    const entidadReceptora =
      datos.entidadReceptora === undefined
        ? deduccionActual.EntidadReceptora
        : validateText(datos.entidadReceptora, "Entidad receptora", 100, true);

    const deduccionActualizada =
      await deduccionesRepository.updateDatosDeduccion(
        id,
        {
          nombre,
          entidadReceptora,
        },
        transaction,
      );

    if (!deduccionActualizada) {
      throw serviceError("No se pudo actualizar la deducción.", 409);
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.DEDUCCIONES,
        registroId: id,
        accion: acciones.ACTUALIZAR,
        datosAnteriores: deduccionActual,
        datosNuevos: deduccionActualizada,
      },
      transaction,
    );

    await transaction.commit();

    return deduccionActualizada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la actualización de la deducción:",
        rollbackError,
      );
    }

    throw error;
  }
}

export async function crearVersionDeduccion(
  deduccionId,
  datos = {},
  usuario,
) {
  if (usuario.Rol !== "ADMINISTRADOR") {
    throw serviceError(
      "Solo Administración puede crear versiones de deducciones.",
      403,
    );
  }

  const id = validateId(deduccionId, "DeduccionId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const fechaInicio = validateDate(
    datos.fechaVigenciaInicio,
    "Inicio de vigencia",
  );

  const fechaFin = validateDate(
    datos.fechaVigenciaFin,
    "Fin de vigencia",
    true,
  );

  const { fechaHoy } = obtenerCalendarioActual();
  const hoy = validateDate(fechaHoy, "Fecha actual");

  if (fechaInicio < hoy) {
    throw serviceError(
      "La nueva vigencia debe comenzar hoy o en una fecha futura.",
      400,
    );
  }

  if (fechaFin && fechaFin < fechaInicio) {
    throw serviceError(
      "El fin de vigencia no puede ser anterior al inicio.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    const deduccionActual =
      await deduccionesRepository.getDeduccionById(id, transaction);

    if (!deduccionActual) {
      throw serviceError(
        "No se encontró la deducción seleccionada.",
        404,
      );
    }

    if (fechaInicio <= deduccionActual.FechaVigenciaInicio) {
      throw serviceError(
        "La nueva versión debe comenzar después del inicio de la versión seleccionada.",
        409,
      );
    }

    let porcentaje = null;

    if (deduccionActual.TipoDeduccion === "LEGAL") {
      porcentaje = Number(datos.porcentaje);

      if (
        !["number", "string"].includes(typeof datos.porcentaje) ||
        !Number.isFinite(porcentaje) ||
        porcentaje <= 0 ||
        porcentaje > 100 ||
        Number(porcentaje.toFixed(2)) !== porcentaje
      ) {
        throw serviceError(
          "El porcentaje debe ser mayor que 0, máximo 100 y tener hasta dos decimales.",
          400,
        );
      }
    } else if (
      datos.porcentaje != null &&
      datos.porcentaje !== ""
    ) {
      throw serviceError(
        "Las deducciones adicionales guardan el porcentaje en cada solicitud.",
        400,
      );
    }

    const superpuesta =
      await deduccionesRepository.existeVigenciaSuperpuesta(
        deduccionActual.Codigo,
        fechaInicio,
        fechaFin,
        transaction,
        id,
      );

    if (superpuesta) {
      throw serviceError(
        "La nueva vigencia se superpone con otra versión de esta deducción.",
        409,
      );
    }

    // La anterior debe terminar antes de comenzar la nueva.
    const fechaFinAnterior = new Date(fechaInicio);

    fechaFinAnterior.setUTCDate(
      fechaFinAnterior.getUTCDate() - 1,
    );

    // Si la versión anterior ya terminó antes, conservamos su fecha.
    if (
      !deduccionActual.FechaVigenciaFin ||
      deduccionActual.FechaVigenciaFin > fechaFinAnterior
    ) {
      const anteriorActualizada =
        await deduccionesRepository.updateFechaFinDeduccion(
          id,
          fechaFinAnterior,
          transaction,
        );

      if (!anteriorActualizada) {
        throw serviceError(
          "No se pudo finalizar la versión anterior.",
          409,
        );
      }

      await registrarBitacora(
        {
          usuarioId,
          entidad: entidades.DEDUCCIONES,
          registroId: id,
          accion: acciones.ACTUALIZAR,
          datosAnteriores: deduccionActual,
          datosNuevos: anteriorActualizada,
        },
        transaction,
      );
    }

    const nuevaVersion =
      await deduccionesRepository.createDeduccion(
        {
          nombre: deduccionActual.Nombre,
          codigo: deduccionActual.Codigo,
          tipoDeduccion: deduccionActual.TipoDeduccion,
          porcentaje,
          fechaVigenciaInicio: fechaInicio,
          fechaVigenciaFin: fechaFin,
          entidadReceptora: deduccionActual.EntidadReceptora,
        },
        transaction,
      );

    if (!nuevaVersion) {
      throw serviceError(
        "No se pudo crear la nueva versión de la deducción.",
        500,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.DEDUCCIONES,
        registroId: nuevaVersion.DeduccionId,
        accion: acciones.CREAR,
        datosAnteriores: null,
        datosNuevos: nuevaVersion,
      },
      transaction,
    );

    await transaction.commit();

    return nuevaVersion;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la creación de la versión:",
        rollbackError,
      );
    }

    throw error;
  }
}

export async function finalizarVigenciaDeduccion(
  deduccionId,
  fechaFin,
  usuario,
) {
  if (usuario.Rol !== "ADMINISTRADOR") {
    throw serviceError(
      "Solo Administración puede finalizar deducciones.",
      403,
    );
  }

  const id = validateId(deduccionId, "DeduccionId");
  const usuarioId = validateId(usuario.UsuarioId, "UsuarioId");

  const fechaFinal = validateDate(
    fechaFin,
    "Fin de vigencia",
  );

  const { fechaHoy } = obtenerCalendarioActual();
  const hoy = validateDate(fechaHoy, "Fecha actual");

  if (fechaFinal < hoy) {
    throw serviceError(
      "El fin de vigencia debe ser hoy o una fecha futura.",
      400,
    );
  }

  const transaction = await beginTransaction();

  try {
    const deduccionActual =
      await deduccionesRepository.getDeduccionById(id, transaction);

    if (!deduccionActual) {
      throw serviceError(
        "No se encontró la deducción seleccionada.",
        404,
      );
    }

    if (fechaFinal < deduccionActual.FechaVigenciaInicio) {
      throw serviceError(
        "El fin de vigencia no puede ser anterior al inicio.",
        400,
      );
    }

    if (
      deduccionActual.FechaVigenciaFin &&
      fechaFinal > deduccionActual.FechaVigenciaFin
    ) {
      throw serviceError(
        "Esta función permite finalizar o acortar la vigencia. Para una vigencia posterior, cree otra versión.",
        409,
      );
    }

    const superpuesta =
      await deduccionesRepository.existeVigenciaSuperpuesta(
        deduccionActual.Codigo,
        deduccionActual.FechaVigenciaInicio,
        fechaFinal,
        transaction,
        id,
      );

    if (superpuesta) {
      throw serviceError(
        "La vigencia indicada se superpone con otra versión de esta deducción.",
        409,
      );
    }

    const deduccionFinalizada =
      await deduccionesRepository.updateFechaFinDeduccion(
        id,
        fechaFinal,
        transaction,
      );

    if (!deduccionFinalizada) {
      throw serviceError(
        "No se pudo finalizar la vigencia de la deducción.",
        409,
      );
    }

    await registrarBitacora(
      {
        usuarioId,
        entidad: entidades.DEDUCCIONES,
        registroId: id,
        accion: acciones.ACTUALIZAR,
        datosAnteriores: deduccionActual,
        datosNuevos: deduccionFinalizada,
      },
      transaction,
    );

    await transaction.commit();

    return deduccionFinalizada;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir el fin de vigencia:",
        rollbackError,
      );
    }

    throw error;
  }
}

