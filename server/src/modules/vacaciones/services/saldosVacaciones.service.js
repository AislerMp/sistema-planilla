import { beginTransaction } from "../../../shared/config/database.js";
import {
  serviceError,
  validateDate,
  validateId,
} from "../../../shared/utils/serviceUtils.js";
import * as colaboradorRepository from "../../colaboradores/colaboradores.repository.js";
import {
  registrarBitacora,
  entidades,
  acciones,
} from "../../bitacora/bitacora.service.js";
import * as saldosRepository from "../repositorios/saldosVacaciones.repository.js";
import { bloquearColaboradorSolicitudes } from "../../solicitudes/solicitudes.repository.js";
import {
  fechaSQLComoTexto,
  obtenerFechaCorteVacaciones,
} from "../../../shared/utils/fechaUtils.js";
import * as asistenciasRepository from "../../asistenciasDiarias/asistenciasDiarias.repository.js";
import * as incapacidadesRepository from "../../incapacidades/incapacidades.repository.js";
import * as permisosRepository from "../../permisosLaborales/permisosLaborales.repository.js";

export async function inicializarSaldoVacaciones(
  colaboradorID,
  usuarioActorID,
) {
  const colaboradorId = validateId(colaboradorID, "ColaboradorId");
  const usuarioActorId = validateId(usuarioActorID, "UsuarioId");

  const transaction = await beginTransaction();

  try {
    const colaborador = await colaboradorRepository.getColaboradorById(
      colaboradorId,
      transaction,
    );

    if (!colaborador) {
      throw serviceError("No se encontró el colaborador.", 404);
    }

    const saldoObj = await saldosRepository.getSaldoByColaborador(
      colaboradorId,
      transaction,
    );

    if (saldoObj) {
      throw serviceError(
        "El colaborador ya tiene un saldo de vacaciones inicializado.",
        409,
      );
    }

    const saldoCreado = await saldosRepository.createSaldo(
      {
        colaboradorId,
        diasAcumulados: 0,
        diasUtilizados: 0,
        fechaAcumuladaHasta: colaborador.FechaIngreso,
      },
      transaction,
    );

    if (!saldoCreado) {
      throw serviceError("No se pudo inicializar el saldo de vacaciones.", 500);
    }

    await registrarBitacora(
      {
        usuarioId: usuarioActorId,
        entidad: entidades.SALDOS_VACACIONES,
        registroId: colaboradorId,
        accion: acciones.CREAR,
        datosNuevos: saldoCreado,
        datosAnteriores: null,
      },
      transaction,
    );

    await transaction.commit();
    return saldoCreado;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error(
        "No se pudo revertir la inicialización del saldo de vacaciones:",
        rollbackError,
      );
    }

    throw error;
  }
}

export async function obtenerSaldoVacaciones(id) {
  const colaboradorId = validateId(id);

  const saldo = await saldosRepository.getSaldoByColaborador(colaboradorId);

  if (!saldo) throw serviceError("Saldo no inicializado", 404);

  return saldo;
}

export async function acumularVacacionesColaborador(
  colaboradorId,
  fechaCorte,
  usuarioActorId,
  transaction,
) {
  if (!transaction) {
    throw serviceError(
      "Se requiere una transacción para acumular vacaciones.",
      500,
    );
  }

  const colaboradorID = validateId(colaboradorId, "ColaboradorId");
  const fechaDelCorte = validateDate(fechaCorte, "Fecha de corte");
  const usuarioID = validateId(usuarioActorId, "UsuarioId");

  await bloquearColaboradorSolicitudes(colaboradorID, transaction);

  const saldo = await saldosRepository.getSaldoByColaborador(
    colaboradorID,
    transaction,
  );

  if (!saldo) {
    throw serviceError(
      "El colaborador no tiene un saldo de vacaciones inicializado.",
      404,
    );
  }

  // Empezamos el día posterior a la última fecha procesada.
  const fechaDesde = new Date(saldo.FechaAcumuladaHasta);
  fechaDesde.setUTCDate(fechaDesde.getUTCDate() + 1);

  if (fechaDesde > fechaDelCorte) {
    return saldo;
  }

  // Revisamos la semana completa para reconocer el descanso, aunque algunos
  // días ya aportaron vacaciones en ejecuciones anteriores.
  const inicioConsulta = new Date(fechaDesde);
  const diaSemana = inicioConsulta.getUTCDay();
  const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  inicioConsulta.setUTCDate(inicioConsulta.getUTCDate() - diasDesdeLunes);

  const filtros = {
    desde: inicioConsulta,
    hasta: fechaDelCorte,
  };

  const asistencias = await asistenciasRepository.getAsistenciasByColaborador(
    colaboradorID,
    filtros,
    transaction,
  );

  const incapacidades =
    await incapacidadesRepository.getIncapacidadesByColaborador(
      colaboradorID,
      {
        ...filtros,
        estado: "APROBADA",
      },
      transaction,
    );

  const permisos = await permisosRepository.getPermisosByColaborador(
    colaboradorID,
    { ...filtros, estado: "APROBADA" },
    transaction,
  );

  // Cada fecha válida aporta una sola vez, tanto al cálculo diario como al semanal.
  const fechasLaboradas = new Set();

  for (const asistencia of asistencias) {
    if (!(asistencia.MinutosEfectivos > 0)) {
      continue;
    }

    const fechaAsistencia = fechaSQLComoTexto(asistencia.FechaAsignada);

    const tieneIncapacidad = incapacidades.some((incapacidad) => {
      const fechaInicio = fechaSQLComoTexto(incapacidad.FechaInicio);
      const fechaFin = fechaSQLComoTexto(incapacidad.FechaFin);

      return fechaAsistencia >= fechaInicio && fechaAsistencia <= fechaFin;
    });

    const tienePermiso = permisos.some(
      (permiso) => fechaSQLComoTexto(permiso.FechaSolicitada) === fechaAsistencia,
    );

    if (!tieneIncapacidad && !tienePermiso) {
      fechasLaboradas.add(fechaAsistencia);
    }
  }

  const diaLibreAdicional = acumularDiaLibre(
    fechaDesde,
    fechaDelCorte,
    fechasLaboradas,
  );

  // Solo sumamos el aporte diario de las fechas pendientes, no de toda la consulta.
  const desdePendiente = fechaSQLComoTexto(fechaDesde);
  const diasLaborados = [...fechasLaboradas].filter(
    (fecha) => fecha >= desdePendiente,
  ).length;
  // Cada día válido aporta 0.04; cada semana cerrada con trabajo aporta otros 0.04.
  const diasGanados = Number(
    (diasLaborados * 0.04 + diaLibreAdicional).toFixed(2),
  );
  const diasAcumuladosActuales = Number(saldo.DiasAcumulados);

  if (!Number.isFinite(diasAcumuladosActuales)) {
    throw serviceError(
      "El saldo acumulado de vacaciones contiene un valor inválido.",
      500,
    );
  }

  const nuevoAcumulado = Number(
    (diasAcumuladosActuales + diasGanados).toFixed(2),
  );

  // Avanzamos la fecha aunque no haya días laborados.
  const saldoActualizado = await saldosRepository.updateDiasAcumulados(
    colaboradorID,
    nuevoAcumulado,
    fechaDelCorte,
    transaction,
  );

  if (!saldoActualizado) {
    throw serviceError(
      "No se pudo actualizar el saldo acumulado de vacaciones.",
      409,
    );
  }

  await registrarBitacora(
    {
      usuarioId: usuarioID,
      entidad: entidades.SALDOS_VACACIONES,
      registroId: colaboradorID,
      accion: acciones.ACTUALIZAR,
      datosAnteriores: saldo,
      datosNuevos: {
        ...saldoActualizado,
        diasLaboradosProcesados: diasLaborados,
        diasGanadosPorDescanso: diaLibreAdicional,
        diasGanados,
      },
    },
    transaction,
  );

  return saldoActualizado;
}

function acumularDiaLibre(fechaDesde, fechaCorte, fechasLaboradas) {
  let descansos = 0;
  const fechas = [...fechasLaboradas];

  // Primer domingo pendiente. Los anteriores ya quedaron procesados con el saldo.
  const domingo = new Date(fechaDesde);
  const diasHastaDomingo = (7 - domingo.getUTCDay()) % 7;
  domingo.setUTCDate(domingo.getUTCDate() + diasHastaDomingo);

  while (domingo <= fechaCorte) {
    const lunes = new Date(domingo);
    lunes.setUTCDate(lunes.getUTCDate() - 6);

    const desde = fechaSQLComoTexto(lunes);
    const hasta = fechaSQLComoTexto(domingo);
    
    const trabajoEsaSemana = fechas.some(
      (fecha) => fecha >= desde && fecha <= hasta,
    );

    if (trabajoEsaSemana) descansos++;

    // También permite recuperar semanas si el servidor estuvo apagado el lunes.
    domingo.setUTCDate(domingo.getUTCDate() + 7);
  }

  return Number((descansos * 0.04).toFixed(2));
}

export async function actualizarAcumulacionVacaciones(
  usuarioActorId,
  fechaCorte = obtenerFechaCorteVacaciones(),
) {
  const userId = validateId(usuarioActorId, "UsuarioId");
  validateDate(fechaCorte, "Fecha de corte");

  const colaboradores =
    await saldosRepository.getColaboradoresParaAcumulacion();

  let procesados = 0;
  let fallidos = 0;

  for (const colaborador of colaboradores) {
    let transaction = null;

    try {
      transaction = await beginTransaction();

      await acumularVacacionesColaborador(
        colaborador.ColaboradorId,
        fechaCorte,
        userId,
        transaction,
      );

      await transaction.commit();
      procesados++;
    } catch (error) {
      fallidos++;

      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error(
            "No se pudo revertir la acumulación de vacaciones:",
            rollbackError,
          );
        }
      }

      console.error(
        `No se pudieron acumular vacaciones del colaborador ${colaborador.ColaboradorId}:`,
        error,
      );
    }
  }

  return {
    fechaCorte,
    procesados,
    fallidos,
  };
}
