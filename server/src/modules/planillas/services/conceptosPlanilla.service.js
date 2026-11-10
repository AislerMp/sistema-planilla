import * as conceptosRepository from "../repositories/conceptosPlanilla.repository.js";
import * as detallePlanillaRepository from "../repositories/detallesPlanilla.repository.js";
import { getRestaurantePermitido } from "../../colaboradores/colaboradores.service.js";
import { obtenerLimiteOrdinarioMinutos } from "../../../shared/utils/jornadaUtils.js";
import {
  serviceError,
  validateId,
  validateNumber,
} from "../../../shared/utils/serviceUtils.js";
import {
  obtenerCalendarioActual,
  fechaSQLComoTexto,
} from "../../../shared/utils/fechaUtils.js";
const FACTORES_HORAS = { ORDINARIA: 1, EXTRA: 1.5, FERIADO: 2 };
const FACTORES_JORNADAS = { DIURNA: 8, NOCTURNA: 6, MIXTA: 7 };

export async function listarConceptosPorDetalle(
  detallePlanillaId,
  usuario,
  transaction = null,
) {
  const id = validateId(detallePlanillaId, "DetallePlanillaId");
  const detalle = await detallePlanillaRepository.getDetalleById(
    id,
    transaction,
  );

  if (!detalle) {
    throw serviceError("El detalle de planilla no existe.", 404);
  }

  if (
    usuario.Rol === "COLABORADOR" &&
    detalle.ColaboradorId !== validateId(usuario.ColaboradorId, "ColaboradorId")
  ) {
    throw serviceError(
      "Solo podés consultar los conceptos de tu propia planilla.",
      403,
    );
  }

  if (usuario.Rol === "GERENTE") {
    const restauranteId = await getRestaurantePermitido(usuario);
    if (detalle.RestauranteId !== restauranteId) {
      throw serviceError(
        "Solo podés consultar planillas de tu restaurante asignado.",
        403,
      );
    }
  }

  return conceptosRepository.getConceptosByDetalle(id, transaction);
}

export async function calcularConceptosColaborador(datosCalculo) {
  const {
    tarifaHora,
    asistencias,
    feriados,
    vacaciones,
    incapacidades,
    deducciones,
  } = datosCalculo;

  const conceptosCalculados = [];

  // Base diaria según la equivalencia que definimos.
  const tarifaXDia = tarifaHora * FACTORES_JORNADAS.DIURNA;

  // CÁLCULO DE ASISTENCIAS
  for (const asistencia of asistencias) {
    const fechaAsignada = fechaSQLComoTexto(asistencia.FechaAsignada);

    const esFeriado = feriados.some(
      (feriado) => fechaSQLComoTexto(feriado.Fecha) === fechaAsignada,
    );

    if (asistencia.MinutosEfectivos === 0 && asistencia.MinutosExtras === 0) {
      continue;
    }

    const tipoJornada = asistencia.TipoJornada;
    const jornadaParaCalculo = tipoJornada ?? "DIURNA";
    if (!FACTORES_JORNADAS[jornadaParaCalculo]) {
      throw serviceError(
        `La asistencia del ${fechaAsignada} tiene minutos reconocidos y no tiene una jornada válida.`,
        409,
      );
    }

    // Una asistencia sin minutos no genera conceptos.
    if (asistencia.MinutosEfectivos === 0 && asistencia.MinutosExtras === 0) {
      continue;
    }

    const factor = esFeriado
      ? FACTORES_HORAS.FERIADO
      : FACTORES_HORAS.ORDINARIA;

    const valorTarifaHora = tarifaXDia / FACTORES_JORNADAS[jornadaParaCalculo];

    // Las horas conservan su duración real.
    const horasEfectivas = asistencia.MinutosEfectivos / 60;
    const horasExtras = asistencia.MinutosExtras / 60;

    const conceptosAsistencia = [
      {
        tipoConcepto: "INGRESO",
        codigoConcepto: esFeriado ? "ORDINARIAS_FERIADO" : "ORDINARIAS",
        tipoJornada: jornadaParaCalculo,
        minutos: asistencia.MinutosEfectivos,
        factorAplicado: factor,
        monto: horasEfectivas * valorTarifaHora * factor,
      },
      {
        tipoConcepto: "INGRESO",
        codigoConcepto: esFeriado ? "EXTRAS_FERIADO" : "EXTRAS",
        tipoJornada: jornadaParaCalculo,
        minutos: asistencia.MinutosExtras,
        factorAplicado: FACTORES_HORAS.EXTRA * factor,
        monto: horasExtras * valorTarifaHora * FACTORES_HORAS.EXTRA * factor,
      },
    ];

    // Acumular los conceptos de la misma clase y jornada.
    for (const concepto of conceptosAsistencia) {
      if (concepto.minutos === 0) {
        continue;
      }

      const conceptoExistente = conceptosCalculados.find(
        (actual) =>
          actual.codigoConcepto === concepto.codigoConcepto &&
          actual.tipoJornada === concepto.tipoJornada,
      );

      if (conceptoExistente) {
        conceptoExistente.minutos += concepto.minutos;
        conceptoExistente.monto += concepto.monto;
      } else {
        conceptosCalculados.push(concepto);
      }
    }
  }
  // FIN CALCULO DE ASISTENCIAS

  // DESCANSO SEMANAL
  let horasOrdinariasEquivalentes = 0;

  for (const concepto of conceptosCalculados) {
    const esOrdinario =
      concepto.codigoConcepto === "ORDINARIAS" ||
      concepto.codigoConcepto === "ORDINARIAS_FERIADO";

    if (!esOrdinario) continue;

    const horasOrdinarias = concepto.minutos / 60;
    const horasJornada = FACTORES_JORNADAS[concepto.tipoJornada];

    horasOrdinariasEquivalentes +=
      (horasOrdinarias / horasJornada) * FACTORES_JORNADAS.DIURNA;
  }

  const horasDescanso = horasOrdinariasEquivalentes / 6;

  if (horasDescanso > 0) {
    conceptosCalculados.push({
      tipoConcepto: "INGRESO",
      codigoConcepto: "DESCANSO_SEMANAL",
      tipoJornada: null,
      minutos: null,
      factorAplicado: 1 / 6,
      monto: horasDescanso * tarifaHora,
    });
  }

  // INICIO CALCULO VACACIONES

  const minutosVacaciones = vacaciones.reduce(
    (total, calculo) => total + calculo.MinutosReconocidos,
    0,
  );

  if (minutosVacaciones > 0) {
    conceptosCalculados.push({
      tipoConcepto: "INGRESO",
      codigoConcepto: "VACACIONES",
      tipoJornada: null,
      minutos: minutosVacaciones,
      factorAplicado: 1,
      monto: (minutosVacaciones / 60) * tarifaHora,
    });
  }
  // FIN CALCULO VACACIONES

  // INICIO CÁLCULO DE INCAPACIDADES
  for (const calculo of incapacidades) {
    const minutosReconocidos = calculo.MinutosReconocidos;

    if (minutosReconocidos === 0) {
      continue;
    }

    const codigoConcepto = calculo.CodigoTipoIncapacidad;
    const monto = (minutosReconocidos / 60) * tarifaHora;

    const conceptoExistente = conceptosCalculados.find(
      (concepto) =>
        concepto.tipoConcepto === "INGRESO" &&
        concepto.codigoConcepto === codigoConcepto,
    );

    if (conceptoExistente) {
      conceptoExistente.minutos += minutosReconocidos;
      conceptoExistente.monto += monto;
    } else {
      conceptosCalculados.push({
        tipoConcepto: "INGRESO",
        codigoConcepto,
        tipoJornada: null,
        minutos: minutosReconocidos,
        factorAplicado: 1,
        monto,
      });
    }
  }
  // FIN CÁLCULO DE INCAPACIDADES

  for (const concepto of conceptosCalculados) {
    concepto.monto = Number(concepto.monto.toFixed(2));
  }

  const salarioBruto = conceptosCalculados.reduce(
    (total, c) => total + c.monto,
    0,
  );

  for (const deduccion of deducciones) {
    const factor = deduccion.Porcentaje / 100;

    if (salarioBruto === 0 || factor === 0) {
      continue;
    }

    conceptosCalculados.push({
      tipoConcepto: "DEDUCCION",
      codigoConcepto: deduccion.Codigo,
      tipoJornada: null,
      minutos: null,
      factorAplicado: factor,
      monto: salarioBruto * factor,
    });
  }

  // Redondear después de acumular cada concepto.
  for (const concepto of conceptosCalculados) {
    concepto.monto = Number(concepto.monto.toFixed(2));
  }

  return conceptosCalculados;
}

export async function registrarConceptosPlanilla(
  detallePlanillaId,
  conceptos,
  transaction,
) {
  if (!transaction) {
    throw serviceError(`Transaction no proporcionada`, 400);
  }
  const idDetallePlanilla = validateId(
    detallePlanillaId,
    `ID de DetallePlanilla no válido`,
  );

  const detallePlanillaActual = await detallePlanillaRepository.getDetalleById(
    idDetallePlanilla,
    transaction,
  );

  if (!detallePlanillaActual) {
    throw serviceError(
      `DetallePlanilla con ID ${idDetallePlanilla} no encontrado`,
      404,
    );
  }

  if (!conceptos || conceptos.length === 0) {
    throw serviceError(`No se proporcionaron conceptos para registrar`, 400);
  }

  let conceptosRegistrados = [];
  for (const concepto of conceptos) {
    const conceptoRegistrado = await conceptosRepository.createConceptoPlanilla(
      {
        ...concepto,
        detallePlanillaId: idDetallePlanilla,
      },
      transaction,
    );

    if (!conceptoRegistrado) {
      throw serviceError(`Error al registrar el concepto`, 500);
    }

    conceptosRegistrados.push(conceptoRegistrado);
  }

  return conceptosRegistrados;
}
