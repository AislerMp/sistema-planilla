import * as conceptosRepository from "../repositories/conceptosPlanilla.repository.js";
import * as detallePlanillaRepository from "../repositories/detallesPlanilla.repository.js";
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

export async function obtenerConceptoPlanilla(
  conceptoPlanillaId,
  transaction = null,
) {
  const id = validateId(conceptoPlanillaId, "ConceptoPlanillaId");
  const concepto = await conceptosRepository.getConceptoById(id, transaction);

  if (!concepto) {
    throw serviceError("El concepto de planilla no existe.", 404);
  }

  return concepto;
}

export async function listarConceptosPorDetalle(
  detallePlanillaId,
  transaction = null,
) {
  const id = validateId(detallePlanillaId, "DetallePlanillaId");
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

    const tipoJornada = asistencia.TipoJornada;

    // Una asistencia sin minutos no genera conceptos.
    if (asistencia.MinutosEfectivos === 0 && asistencia.MinutosExtras === 0) {
      continue;
    }

    const factor = esFeriado
      ? FACTORES_HORAS.FERIADO
      : FACTORES_HORAS.ORDINARIA;

    const valorTarifaHora = tarifaXDia / FACTORES_JORNADAS[tipoJornada];

    // Las horas conservan su duración real.
    const horasEfectivas = asistencia.MinutosEfectivos / 60;
    const horasExtras = asistencia.MinutosExtras / 60;

    const conceptosAsistencia = [
      {
        tipoConcepto: "INGRESO",
        codigoConcepto: esFeriado ? "ORDINARIAS_FERIADO" : "ORDINARIAS",
        tipoJornada,
        minutos: asistencia.MinutosEfectivos,
        factorAplicado: factor,
        monto: horasEfectivas * valorTarifaHora * factor,
      },
      {
        tipoConcepto: "INGRESO",
        codigoConcepto: esFeriado ? "EXTRAS_FERIADO" : "EXTRAS",
        tipoJornada,
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

  // INICIO CALCULO VACACIONES

  conceptosCalculados.push({
    tipoConcepto: "INGRESO",
    codigoConcepto: "VACACIONES",
    tipoJornada: null,
    minutos: vacaciones.reduce((total, v) => total + v.MinutosReconocidos, 0),
    factorAplicado: 1,
    monto: vacaciones.reduce(
      (total, v) => total + (v.MinutosReconocidos / 60) * tarifaHora,
      0,
    ), // Aquí puedes calcular el monto correspondiente si es necesario
  });
  // FIN CALCULO VACACIONES

  // INICIO CALCULO DE INCAPACIDADES

  conceptosCalculados.push({
    tipoConcepto: "INGRESO",
    codigoConcepto: "INCAPACIDADES",
    tipoJornada: null,
    minutos: incapacidades.reduce(
      (total, i) => total + i.MinutosReconocidos,
      0,
    ),
    factorAplicado: 1,
    monto: incapacidades.reduce(
      (total, i) => total + (i.MinutosReconocidos / 60) * tarifaHora,
      0,
    ),
  });
  // FIN CALCULO DE INCAPACIDADES

  const salarioBruto = conceptosCalculados.reduce(
    (total, c) => total + c.monto,
    0,
  );

  for (const deduccion of deducciones) {
    const factor = deduccion.Porcentaje / 100;
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
