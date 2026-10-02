import assert from "node:assert/strict";
import { test, mock } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool } = await import("../src/shared/config/database.js");
const { listarBitacoras, obtenerBitacora } = await import("../src/modules/bitacora/bitacora.service.js");

test("bitácoras valida filtros e IDs antes de consultar", async () => {
  for (const filtros of [
    { pagina: 0 }, { pagina: "1.5" }, { usuarioId: -1 }, { registroId: "abc" },
    { entidad: "Desconocida" }, { accion: "BORRAR" },
    { desde: "2026-02-30" }, { desde: "2026-10-02", hasta: "2026-10-01" },
  ]) {
    await assert.rejects(listarBitacoras(filtros), { status: 400 });
  }
  for (const id of [null, "abc", "0", "9223372036854775808", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(obtenerBitacora(id), { status: 400 });
  }
});

test("bitácoras pagina de 50 en 50 y convierte días de Costa Rica a UTC", async () => {
  let params;
  mock.method(pool, "connect", async () => pool);
  mock.method(pool, "request", () => {
    params = {};
    return {
      input(name, type, value) { params[name] = value; return this; },
      async query() { return { recordsets: [[{ Total: 123 }], []] }; },
    };
  });
  try {
    const resultado = await listarBitacoras({ pagina: "4", desde: "2026-09-30", hasta: "2026-09-30" });
    assert.equal(params.offset, 150);
    assert.equal(params.porPagina, 50);
    assert.equal(params.desde.toISOString(), "2026-09-30T06:00:00.000Z");
    assert.equal(params.hasta.toISOString(), "2026-10-01T06:00:00.000Z");
    assert.deepEqual(resultado, { registros: [], pagina: 4, porPagina: 50, total: 123, totalPaginas: 3 });
    assert.equal((await listarBitacoras()).pagina, 1);
    assert.equal(params.offset, 0);
    assert.equal(params.desde, null);
    assert.equal(params.hasta, null);
  } finally { mock.restoreAll(); }
});

test("detalle conserva BIGINT, convierte los JSON y devuelve 404 si no existe", async () => {
  let registro = { DatosAnteriores: null, DatosNuevos: '{"activo":false,"minutos":0}' };
  const id = "9007199254740993";
  mock.method(pool, "connect", async () => pool);
  mock.method(pool, "request", () => ({
    input(name, type, value) { assert.equal(value, id); return this; },
    async query() { return { recordset: registro ? [registro] : [] }; },
  }));
  try {
    assert.deepEqual(await obtenerBitacora(id), { DatosAnteriores: null, DatosNuevos: { activo: false, minutos: 0 } });
    registro.DatosAnteriores = '{"activo":true}';
    assert.deepEqual((await obtenerBitacora(id)).DatosAnteriores, { activo: true });
    registro = null;
    await assert.rejects(obtenerBitacora(id), { status: 404 });
  } finally { mock.restoreAll(); }
});
