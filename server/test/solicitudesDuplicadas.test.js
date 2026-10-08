import assert from "node:assert/strict";
import { test, mock } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { crearSolicitudHorasExtras, getSolicitudesByColaborador } = await import("../src/modules/extras/horasExtras.service.js");
const { obtenerCalendarioActual } = await import("../src/shared/utils/fechaUtils.js");

test("consultar rechaza solo pendientes vencidas y aplica el filtro después", async () => {
  const { fechaHoy } = obtenerCalendarioActual();
  const registros = [
    { SolicitudId: 1, FechaSolicitada: new Date("2000-01-01"), Estado: "PENDIENTE" },
    { SolicitudId: 2, FechaSolicitada: new Date(fechaHoy), Estado: "PENDIENTE" },
    { SolicitudId: 3, FechaSolicitada: new Date("2099-01-01"), Estado: "PENDIENTE" },
    { SolicitudId: 4, FechaSolicitada: new Date("2000-01-01"), Estado: "APROBADA" },
  ];
  mock.method(pool, "connect", async () => pool);
  let lecturas = 0;
  mock.method(pool, "request", () => {
    const params = {};
    return {
      input(name, type, value) { params[name] = value; return this; },
      async query(query) {
        if (query.includes("UPDATE s")) {
          assert.equal(params.colaboradorId, 4);
          assert.equal(params.fechaHoy, fechaHoy);
          assert.match(query, /s.Estado = 'PENDIENTE'[\s\S]*d.FechaSolicitada < @fechaHoy/);
          assert.match(query, /ColaboradorId = @colaboradorId/);
          for (const solicitud of registros) {
            if (solicitud.Estado === "PENDIENTE" && solicitud.FechaSolicitada < new Date(fechaHoy)) solicitud.Estado = "RECHAZADA";
          }
          return { rowsAffected: [1] };
        }
        lecturas++;
        assert.equal(params.colaboradorId, 4);
        return { recordset: registros.filter((row) => row.Estado === params.estado) };
      },
    };
  });
  mock.method(sql.Transaction.prototype, "begin", async () => {});
  mock.method(sql.Transaction.prototype, "commit", async () => {});
  mock.method(sql.Transaction.prototype, "request", () => pool.request());
  try {
    const resultado = await getSolicitudesByColaborador(4, { estado: "RECHAZADA" }, { Rol: "COLABORADOR", ColaboradorId: 4 });
    assert.deepEqual(resultado.map((row) => row.SolicitudId), [1]);
    assert.equal(lecturas, 1);
    assert.deepEqual(registros.map((row) => row.Estado), ["RECHAZADA", "PENDIENTE", "PENDIENTE", "APROBADA"]);
  } finally {
    mock.restoreAll();
  }
});

test("crear solicitud rechaza hoy y fechas anteriores antes de consultar la base", async () => {
  const { fechaHoy } = obtenerCalendarioActual();
  for (const fechaSolicitada of [fechaHoy, "2000-01-01"]) {
    await assert.rejects(crearSolicitudHorasExtras(
      { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" },
      { fechaSolicitada, minutosSolicitados: 60, motivo: "Cierre" },
    ), { status: 400, message: "La fecha solicitada debe ser posterior al día de hoy." });
  }
});
