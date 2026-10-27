import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool } = await import("../src/shared/config/database.js");
const {
  obtenerAsistencia, obtenerAsistenciaPorColaboradorYfecha,
  listarAsistenciasPorColaborador, listarAsistenciasPorRestaurante,
} = await import("../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");

test("consultar un período sin asistencias devuelve una lista vacía para colaborador y administración", async (t) => {
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /FROM dbo.AsistenciasDiarias/);
      return { recordset: [] };
    },
  }));
  assert.deepEqual(await listarAsistenciasPorColaborador(2018, { periodoId: 22 }), []);
  assert.deepEqual(await listarAsistenciasPorRestaurante({ Rol: "RECURSOS_HUMANOS" }, 2, { periodoId: 22 }), []);
});

test("las consultas exponen el límite del backend y conservan el tipo y los minutos", async (t) => {
  // SQL simulado: las consultas de lectura no escriben ni reclasifican registros.
  const filas = ["DIURNA", "MIXTA", "NOCTURNA", null].map((TipoJornada, i) => ({
    AsistenciaId: i + 1, ColaboradorId: 2018, TipoJornada,
    MinutosEfectivos: 300, MinutosExtras: 90,
  }));
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.doesNotMatch(query, /\b(UPDATE|INSERT|DELETE)\b/);
      assert.match(query, /TipoJornada/);
      assert.doesNotMatch(query, /\bLimiteOrdinarioMinutos\b/);
      return { recordset: filas.map((fila) => ({ ...fila })) };
    },
  }));
  for (const consultar of [
    () => listarAsistenciasPorColaborador(2018, { periodoId: 1 }),
    () => listarAsistenciasPorRestaurante({ Rol: "RECURSOS_HUMANOS" }, 2, { periodoId: 1 }),
  ]) {
    const resultado = await consultar();
    assert.deepEqual(resultado.map((a) => a.LimiteOrdinarioMinutos), [480, 420, 360, 480]);
    assert.equal(resultado[3].TipoJornada, null);
    assert.ok(resultado.every((a) => a.MinutosEfectivos === 300 && a.MinutosExtras === 90));
  }
  assert.equal((await obtenerAsistencia(1)).LimiteOrdinarioMinutos, 480);
  assert.equal((await obtenerAsistenciaPorColaboradorYfecha(2018, "2026-10-26")).LimiteOrdinarioMinutos, 480);
  assert.ok(filas.every((a) => !("LimiteOrdinarioMinutos" in a)));
});
