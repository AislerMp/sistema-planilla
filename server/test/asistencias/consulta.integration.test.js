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
  pool
} = await import("../../src/shared/config/database.js");
const {
  obtenerAsistencia,
  obtenerAsistenciaPorColaboradorYfecha,
  listarAsistenciasPorColaborador,
  listarAsistenciasPorRestaurante
} = await import("../../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");
test("consultar un período sin asistencias devuelve una lista vacía para colaborador y administración", async () => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      expect(query).toMatch(/FROM dbo.AsistenciasDiarias/);
      return {
        recordset: []
      };
    }
  }));
  expect(await listarAsistenciasPorColaborador(2018, {
    periodoId: 22
  })).toEqual([]);
  expect(await listarAsistenciasPorRestaurante({
    Rol: "RECURSOS_HUMANOS"
  }, 2, {
    periodoId: 22
  })).toEqual([]);
});
test("las consultas exponen el límite del backend y conservan el tipo y los minutos", async () => {
  // SQL simulado: las consultas de lectura no escriben ni reclasifican registros.
  const filas = ["DIURNA", "MIXTA", "NOCTURNA", null].map((TipoJornada, i) => ({
    AsistenciaId: i + 1,
    ColaboradorId: 2018,
    TipoJornada,
    MinutosEfectivos: 300,
    MinutosExtras: 90
  }));
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      assert.doesNotMatch(query, /\b(UPDATE|INSERT|DELETE)\b/);
      expect(query).toMatch(/TipoJornada/);
      assert.doesNotMatch(query, /\bLimiteOrdinarioMinutos\b/);
      return {
        recordset: filas.map(fila => ({
          ...fila
        }))
      };
    }
  }));
  for (const consultar of [() => listarAsistenciasPorColaborador(2018, {
    periodoId: 1
  }), () => listarAsistenciasPorRestaurante({
    Rol: "RECURSOS_HUMANOS"
  }, 2, {
    periodoId: 1
  })]) {
    const resultado = await consultar();
    expect(resultado.map(a => a.LimiteOrdinarioMinutos)).toEqual([480, 420, 360, 480]);
    expect(resultado[3].TipoJornada).toBe(null);
    expect(resultado.every(a => a.MinutosEfectivos === 300 && a.MinutosExtras === 90)).toBeTruthy();
  }
  expect((await obtenerAsistencia(1)).LimiteOrdinarioMinutos).toBe(480);
  expect((await obtenerAsistenciaPorColaboradorYfecha(2018, "2026-10-26")).LimiteOrdinarioMinutos).toBe(480);
  expect(filas.every(a => !("LimiteOrdinarioMinutos" in a))).toBeTruthy();
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
