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
  getFeriadoByFecha,
  getFeriadosByRango
} = await import("../../src/modules/feriados/feriados.repository.js");
test("feriados: fecha existente, inexistente y rango parametrizado", async () => {
  // Se inspecciona SQL y se simulan sus resultados; no se conecta a SQL Server.
  const consultas = [];
  const feriados = [{
    FeriadoId: 1,
    Fecha: new Date("2026-12-01"),
    Nombre: "Abolición del Ejército"
  }, {
    FeriadoId: 2,
    Fecha: new Date("2026-12-25"),
    Nombre: "Navidad"
  }];
  const transaction = {
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) {
          parametros[nombre] = valor;
          return this;
        },
        async query(query) {
          consultas.push({
            query,
            parametros
          });
          expect(query).toMatch(/SELECT FeriadoId, Fecha, Nombre/);
          return {
            recordset: feriados.filter(feriado => {
              const fecha = feriado.Fecha.toISOString().slice(0, 10);
              return parametros.fecha ? fecha === parametros.fecha : fecha >= parametros.desde && fecha <= parametros.hasta;
            })
          };
        }
      };
    }
  };
  expect(await getFeriadoByFecha("2026-12-25", transaction)).toEqual(feriados[1]);
  expect(await getFeriadoByFecha("2026-12-24", transaction)).toBe(null);
  expect(await getFeriadosByRango("2026-12-01", "2026-12-31", transaction)).toEqual(feriados);
  expect(await getFeriadosByRango("2026-11-01", "2026-11-30", transaction)).toEqual([]);
  expect(consultas[0].query).toMatch(/WHERE Fecha = @fecha/);
  expect(consultas[2].query).toMatch(/Fecha BETWEEN @desde AND @hasta/);
  expect(consultas[2].query).toMatch(/ORDER BY Fecha ASC/);
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => transaction.request());
  expect(await getFeriadoByFecha("2026-12-25")).toEqual(feriados[1]);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
