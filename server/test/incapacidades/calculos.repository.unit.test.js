import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test"
});
const repository = await import("../../src/modules/incapacidades/calculoIncapacidades.repository.js");
function crearTransaccion(consultar) {
  return {
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) {
          parametros[nombre] = valor;
          return this;
        },
        query(query) {
          return consultar(query, parametros);
        }
      };
    }
  };
}
for (const calculos of [[], [{
  CalculoId: 1,
  SolicitudId: 31,
  PeriodoId: 10,
  MinutosReconocidos: 1440
}, {
  CalculoId: 2,
  SolicitudId: 31,
  PeriodoId: 11,
  MinutosReconocidos: 3360
}, {
  CalculoId: 3,
  SolicitudId: 31,
  PeriodoId: 12,
  MinutosReconocidos: 960
}]]) {
  test(`consultar por solicitud conserva los ${calculos.length} cálculos como lista`, async () => {
    const transaction = crearTransaccion(async (query, parametros) => {
      expect(parametros.solicitudId).toBe(31);
      expect(query).toMatch(/WHERE SolicitudId = @solicitudId/);
      expect(query).toMatch(/ORDER BY PeriodoId, CalculoId/);
      assert.doesNotMatch(query, /TOP\s*\(/i);
      assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
      return {
        recordset: calculos
      };
    });
    expect(await repository.getCalculosBySolicitud(31, transaction)).toEqual(calculos);
  });
}
test("guardar maternidad usa solo las columnas existentes de CalculosIncapacidad", async () => {
  const datos = {
    solicitudId: 31,
    periodoId: 10,
    minutosReconocidos: 1440,
    porcentajePatronalAplicado: 50
  };
  const guardado = {
    CalculoId: 1,
    SolicitudId: datos.solicitudId,
    PeriodoId: datos.periodoId,
    MinutosReconocidos: datos.minutosReconocidos,
    PorcentajePatronalAplicado: datos.porcentajePatronalAplicado
  };
  const transaction = crearTransaccion(async (query, parametros) => {
    expect(parametros).toEqual(datos);
    expect(query).toMatch(/INSERT INTO dbo\.CalculosIncapacidad/);
    expect(query).toMatch(/INSERTED\.PeriodoId/);
    assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
    expect(query).toMatch(/s\.Estado = 'APROBADA'/);
    return {
      recordset: [guardado]
    };
  });
  expect(await repository.createCalculoIncapacidad(datos, transaction)).toEqual(guardado);
});
test("los cálculos ordinarios siguen usando las columnas existentes", async () => {
  const transaction = crearTransaccion(async (_query, parametros) => {
    expect(Object.keys(parametros).sort()).toEqual(["minutosReconocidos", "periodoId", "porcentajePatronalAplicado", "solicitudId"].sort());
    return {
      recordset: []
    };
  });
  expect(await repository.createCalculoIncapacidad({
    solicitudId: 31,
    periodoId: 10,
    minutosReconocidos: 720,
    porcentajePatronalAplicado: 50
  }, transaction)).toBe(null);
});
test("ambas consultas usan el esquema original de cálculos", async () => {
  const transaction = crearTransaccion(async query => {
    expect(query).toMatch(/MinutosReconocidos/);
    assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
    return {
      recordset: []
    };
  });
  expect(await repository.getCalculosBySolicitud(31, transaction)).toEqual([]);
  expect(await repository.getCalculosByPeriodo(10, null, transaction)).toEqual([]);
});
test("crear un cálculo exige una transacción y propaga los errores SQL", async () => {
  await assert.rejects(repository.createCalculoIncapacidad({}, null), {
    status: 500
  });
  const errorSql = new Error("No se pudo insertar el segundo período");
  const transaction = crearTransaccion(async () => {
    throw errorSql;
  });
  await assert.rejects(repository.createCalculoIncapacidad({}, transaction), error => error === errorSql);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
