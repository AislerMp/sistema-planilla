import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { solicitarVacaciones } = await import("../src/modules/vacaciones/services/vacaciones.service.js");
const usuario = { UsuarioId: 7, ColaboradorId: 2018 };

function prepararBD(t, fechaInicio) {
  const eventos = [];
  const solicitud = {
    SolicitudId: 31, ColaboradorId: 2018, RestauranteId: 2, Estado: "PENDIENTE",
    FechaInicio: new Date(`${fechaInicio}T00:00:00Z`),
    FechaFin: new Date(`${fechaInicio}T00:00:00Z`), DiasSolicitados: 1,
  };
  t.mock.method(pool, "connect", async () => pool);
  for (const operacion of ["begin", "commit", "rollback"]) {
    t.mock.method(sql.Transaction.prototype, operacion, async () => eventos.push(operacion));
  }
  const request = () => ({
    input() { return this; },
    async query(query) {
      eventos.push(query);
      if (query.includes("SELECT * FROM Colaboradores")) {
        return { recordset: [{ ColaboradorId: 2018, RestauranteId: 2 }] };
      }
      if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return { recordset: [{ ColaboradorId: 2018 }] };
      if (query.includes("SELECT TOP (1) s.SolicitudId")) return { recordset: [] };
      if (query.includes("FROM dbo.Vacaciones")) return { recordset: [] };
      if (query.includes("FROM dbo.SaldosVacaciones")) return { recordset: [{ DiasDisponibles: 20 }] };
      if (query.includes("INSERT INTO dbo.Solicitudes")) return { recordset: [{ SolicitudId: 31 }] };
      if (query.includes("INSERT INTO dbo.Vacaciones")) return { rowsAffected: [1] };
      if (query.includes("FROM dbo.Solicitudes AS s")) return { recordset: [solicitud] };
      if (query.includes("INSERT INTO dbo.Bitacora")) return { rowsAffected: [1] };
      assert.fail(`Consulta no esperada: ${query}`);
    },
  });
  t.mock.method(pool, "request", request);
  t.mock.method(sql.Transaction.prototype, "request", request);
  return eventos;
}

for (const fechaInicio of ["2026-10-12", "2026-10-16", "2026-10-18"]) {
  test(`rechaza ${fechaInicio}, dentro de la semana actual, antes de iniciar la transacción`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T18:00:00Z") });
    const eventos = prepararBD(t, fechaInicio);
    await assert.rejects(solicitarVacaciones({ fechaInicio, fechaFin: fechaInicio }, usuario), {
      status: 400,
      message: "La fecha de inicio de las vacaciones no puede estar dentro de la semana actual (de lunes a domingo).",
    });
    assert.equal(eventos.length, 1, "Solo se consulta el colaborador");
    assert.equal(eventos.includes("begin"), false);
  });
}

for (const caso of [
  { nombre: "lunes próximo", ahora: "2026-10-16T18:00:00Z", inicio: "2026-10-19", permitido: true },
  { nombre: "lunes UTC que aún es domingo en Costa Rica", ahora: "2026-10-19T05:59:59Z", inicio: "2026-10-19", permitido: true },
  { nombre: "lunes a medianoche de Costa Rica", ahora: "2026-10-19T06:00:00Z", inicio: "2026-10-19", permitido: false },
  { nombre: "lunes antes del corte de marcas", ahora: "2026-10-19T08:00:00Z", inicio: "2026-10-19", permitido: false },
  { nombre: "domingo antes de terminar la semana", ahora: "2026-10-19T05:59:59Z", inicio: "2026-10-18", permitido: false },
  { nombre: "domingo de una semana que cruza el año", ahora: "2026-12-31T18:00:00Z", inicio: "2027-01-03", permitido: false },
  { nombre: "lunes próximo al cruzar el año", ahora: "2026-12-31T18:00:00Z", inicio: "2027-01-04", permitido: true },
]) {
  test(caso.nombre, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(caso.ahora) });
    const eventos = prepararBD(t, caso.inicio);
    const solicitud = solicitarVacaciones({ fechaInicio: caso.inicio, fechaFin: caso.inicio }, usuario);
    if (caso.permitido) {
      assert.equal((await solicitud).SolicitudId, 31);
      assert.equal(eventos.includes("begin"), true);
      assert.equal(eventos.at(-1), "commit");
    } else {
      await assert.rejects(solicitud, { status: 400 });
      assert.equal(eventos.includes("begin"), false);
    }
  });
}
