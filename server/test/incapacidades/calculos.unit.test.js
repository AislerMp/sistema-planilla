import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test"
});
const {
  calcularReconocimientoIncapacidad,
  registrarCalculoIncapacidad
} = await import("../../src/modules/incapacidades/services/calculoIncapacidades.services.js");
const fecha = valor => new Date(`${valor}T00:00:00Z`);
const incapacidad = (desde, hasta) => ({
  SolicitudId: 31,
  ColaboradorId: 2018,
  TipoIncapacidadId: 2,
  FechaInicio: fecha(desde),
  FechaFin: fecha(hasta)
});
const sinConsultas = {
  request() {
    assert.fail("Este tipo no necesita consultar antecedentes");
  }
};
test("maternidad no utiliza el cálculo genérico de enfermedad e INS", async () => {
  await assert.rejects(calcularReconocimientoIncapacidad(incapacidad("2026-10-01", "2026-10-07"), {
    TipoIncapacidadId: 2,
    Codigo: "MATERNIDAD_CCSS",
    PorcentajePatronal: 50
  }, sinConsultas), {
    status: 409
  });
});
test("riesgo de trabajo reconoce cero minutos y exige porcentaje patronal cero", async () => {
  const datos = incapacidad("2026-10-01", "2026-10-15");
  const tipo = {
    TipoIncapacidadId: 2,
    Codigo: "RIESGO_TRABAJO_INS",
    PorcentajePatronal: 0
  };
  expect(await calcularReconocimientoIncapacidad(datos, tipo, sinConsultas)).toEqual({
    minutosReconocidos: 0,
    porcentajePatronalAplicado: 0
  });
  await assert.rejects(calcularReconocimientoIncapacidad(datos, {
    ...tipo,
    PorcentajePatronal: 50
  }, sinConsultas), {
    status: 500
  });
});
for (const conAntecedentes of [false, true]) {
  test(`enfermedad conserva su límite de tres días en treinta días, ${conAntecedentes ? "con" : "sin"} antecedentes`, async () => {
    let consultas = 0;
    const transaction = {
      request() {
        return {
          input() {
            return this;
          },
          async query(query) {
            consultas++;
            expect(query).toMatch(/s.Estado = 'APROBADA'/);
            return {
              recordset: conAntecedentes ? [{
                CodigoTipoIncapacidad: "ENFERMEDAD_CCSS",
                FechaInicio: fecha("2026-10-01"),
                FechaFin: fecha("2026-10-03")
              }] : []
            };
          }
        };
      }
    };
    const resultado = await calcularReconocimientoIncapacidad(incapacidad("2026-10-05", "2026-10-09"), {
      TipoIncapacidadId: 2,
      Codigo: "ENFERMEDAD_CCSS",
      PorcentajePatronal: 50
    }, transaction);
    expect(resultado).toEqual({
      minutosReconocidos: conAntecedentes ? 0 : 720,
      porcentajePatronalAplicado: 50
    });
    expect(consultas).toBe(1);
  });
}
test("validadores y errores del servicio de cálculos siguen disponibles después de separar archivos", async () => {
  const datos = incapacidad("2026-10-01", "2026-10-02");
  const tipo = {
    TipoIncapacidadId: 2,
    Codigo: "MATERNIDAD_CCSS",
    PorcentajePatronal: 50
  };
  await assert.rejects(calcularReconocimientoIncapacidad(datos, tipo, null), {
    status: 500
  });
  await assert.rejects(calcularReconocimientoIncapacidad({
    ...datos,
    ColaboradorId: 0
  }, tipo, sinConsultas), {
    status: 400
  });
  await assert.rejects(calcularReconocimientoIncapacidad(datos, {
    ...tipo,
    Codigo: "DESCONOCIDO"
  }, sinConsultas), {
    status: 409
  });
  await assert.rejects(registrarCalculoIncapacidad(datos, {}, null, 7), {
    status: 500
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
