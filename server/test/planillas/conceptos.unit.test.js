import { describe, expect, test } from "@jest/globals";
import { calcularConceptosColaborador } from "../../src/modules/planillas/services/conceptosPlanilla.service.js";

const fecha = texto => new Date(`${texto}T00:00:00Z`);
const asistencia = (cambios = {}) => ({
  FechaAsignada: fecha("2026-10-12"),
  TipoJornada: "DIURNA",
  MinutosEfectivos: 480,
  MinutosExtras: 0,
  ...cambios,
});
const calcular = (cambios = {}) => calcularConceptosColaborador({
  tarifaHora: 1000,
  asistencias: [],
  feriados: [],
  vacaciones: [],
  incapacidades: [],
  deducciones: [],
  ...cambios,
});

describe("Cálculo de conceptos de planilla", () => {
  test.each([
    ["DIURNA", 480],
    ["MIXTA", 420],
    ["NOCTURNA", 360],
  ])("una jornada completa %s reconoce la misma tarifa diaria", async (tipo, minutos) => {
    const conceptos = await calcular({
      asistencias: [asistencia({ TipoJornada: tipo, MinutosEfectivos: minutos })],
    });

    expect(conceptos).toEqual([{
      tipoConcepto: "INGRESO",
      codigoConcepto: "ORDINARIAS",
      tipoJornada: tipo,
      minutos,
      factorAplicado: 1,
      monto: 8000,
    }]);
  });

  test("un feriado duplica las ordinarias y paga las extras con factor 3", async () => {
    const conceptos = await calcular({
      asistencias: [asistencia({ MinutosExtras: 60 })],
      feriados: [{ Fecha: fecha("2026-10-12") }],
    });

    expect(conceptos).toEqual([
      expect.objectContaining({ codigoConcepto: "ORDINARIAS_FERIADO", minutos: 480, factorAplicado: 2, monto: 16000 }),
      expect.objectContaining({ codigoConcepto: "EXTRAS_FERIADO", minutos: 60, factorAplicado: 3, monto: 3000 }),
    ]);
  });

  test("acumula un concepto antes de redondear, evitando diferencias por asistencia", async () => {
    const conceptos = await calcular({
      tarifaHora: 1250.75,
      asistencias: [12, 13, 14].map(dia => asistencia({
        FechaAsignada: fecha(`2026-10-${dia}`), MinutosEfectivos: 1,
      })),
    });

    expect(conceptos).toHaveLength(1);
    expect(conceptos[0]).toMatchObject({ minutos: 3, monto: 62.54 });
  });

  test("calcula cada deducción sobre el bruto que incluye vacaciones e incapacidades", async () => {
    const conceptos = await calcular({
      vacaciones: [{ MinutosReconocidos: 480 }],
      incapacidades: [{ MinutosReconocidos: 240 }],
      deducciones: [
        { Codigo: "CCSS_SEM", Porcentaje: 5.5 },
        { Codigo: "CCSS_IVM", Porcentaje: 4.33 },
        { Codigo: "BANCO_POPULAR", Porcentaje: 1 },
      ],
    });

    const ingresos = conceptos.filter(c => c.tipoConcepto === "INGRESO");
    const deducciones = conceptos.filter(c => c.tipoConcepto === "DEDUCCION");
    expect(ingresos.map(c => c.monto)).toEqual([8000, 4000]);
    expect(deducciones.map(c => c.monto)).toEqual([660, 519.6, 120]);
    expect(deducciones.map(c => c.factorAplicado)).toEqual([0.055, 0.0433, 0.01]);
  });

  test("sin minutos reconocidos no genera ingresos ni deducciones", async () => {
    await expect(calcular({
      asistencias: [asistencia({ MinutosEfectivos: 0 })],
      deducciones: [{ Codigo: "CCSS", Porcentaje: 5.5 }],
    })).resolves.toEqual([]);
  });

  test("rechaza una jornada desconocida cuando tiene minutos por pagar", async () => {
    await expect(calcular({
      asistencias: [asistencia({ TipoJornada: "INVALIDA" })],
    })).rejects.toMatchObject({ status: 409 });
  });
});
