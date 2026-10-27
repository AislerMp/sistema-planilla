import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool } = await import("../src/shared/config/database.js");
const { getFeriadoByFecha, getFeriadosByRango } = await import(
  "../src/modules/planillas/feriados.repository.js"
);

test("feriados: fecha existente, inexistente y rango parametrizado", async (t) => {
  // Se inspecciona SQL y se simulan sus resultados; no se conecta a SQL Server.
  const consultas = [];
  const feriados = [
    { FeriadoId: 1, Fecha: new Date("2026-12-01"), Nombre: "Abolición del Ejército" },
    { FeriadoId: 2, Fecha: new Date("2026-12-25"), Nombre: "Navidad" },
  ];
  const transaction = {
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
        async query(query) {
          consultas.push({ query, parametros });
          assert.match(query, /SELECT FeriadoId, Fecha, Nombre/);
          return { recordset: feriados.filter((feriado) => {
            const fecha = feriado.Fecha.toISOString().slice(0, 10);
            return parametros.fecha
              ? fecha === parametros.fecha
              : fecha >= parametros.desde && fecha <= parametros.hasta;
          }) };
        },
      };
    },
  };

  assert.deepEqual(await getFeriadoByFecha("2026-12-25", transaction), feriados[1]);
  assert.equal(await getFeriadoByFecha("2026-12-24", transaction), null);
  assert.deepEqual(await getFeriadosByRango("2026-12-01", "2026-12-31", transaction), feriados);
  assert.deepEqual(await getFeriadosByRango("2026-11-01", "2026-11-30", transaction), []);
  assert.match(consultas[0].query, /WHERE Fecha = @fecha/);
  assert.match(consultas[2].query, /Fecha BETWEEN @desde AND @hasta/);
  assert.match(consultas[2].query, /ORDER BY Fecha ASC/);

  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => transaction.request());
  assert.deepEqual(await getFeriadoByFecha("2026-12-25"), feriados[1]);
});
