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
    { SolicitudHoraExtraId: 1, FechaSolicitada: new Date("2000-01-01"), Estado: "PENDIENTE" },
    { SolicitudHoraExtraId: 2, FechaSolicitada: new Date(fechaHoy), Estado: "PENDIENTE" },
    { SolicitudHoraExtraId: 3, FechaSolicitada: new Date("2099-01-01"), Estado: "PENDIENTE" },
    { SolicitudHoraExtraId: 4, FechaSolicitada: new Date("2000-01-01"), Estado: "APROBADA" },
  ];
  mock.method(pool, "connect", async () => pool);
  let lecturas = 0;
  mock.method(pool, "request", () => {
    const params = {};
    return {
      input(name, type, value) { params[name] = value; return this; },
      async query(query) {
        if (query.includes("UPDATE dbo.SolicitudesHorasExtras")) {
          assert.equal(params.colaboradorId, 4);
          assert.equal(params.fechaHoy, fechaHoy);
          assert.match(query, /Estado = 'PENDIENTE' AND FechaSolicitada < @fechaHoy/);
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
  try {
    const resultado = await getSolicitudesByColaborador(4, { estado: "RECHAZADA" }, { Rol: "COLABORADOR", ColaboradorId: 4 });
    assert.deepEqual(resultado.map((row) => row.SolicitudHoraExtraId), [1]);
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

test("crear solicitud rechaza una fecha duplicada y permite una fecha libre", async () => {
  const usuario = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  const datos = { fechaSolicitada: "2099-06-15", minutosSolicitados: 60, motivo: "Cierre" };
  let duplicada = true;
  const eventos = [];
  mock.method(pool, "connect", async () => pool);
  mock.method(pool, "request", () => ({
    input() { return this; },
    async query() { return { recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }] }; },
  }));
  mock.method(sql.Transaction.prototype, "begin", async () => {});
  mock.method(sql.Transaction.prototype, "commit", async () => eventos.push("commit"));
  mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
  mock.method(sql.Transaction.prototype, "request", () => {
    const params = {};
    return {
      input(name, type, value) { params[name] = value; return this; },
      async query(query) {
        if (query.includes("SELECT TOP (1)")) {
          assert.equal(new Date(params.fecha).toISOString().slice(0, 10), datos.fechaSolicitada);
          assert.equal(params.colaboradorId, usuario.ColaboradorId);
          eventos.push("consultar");
          return { recordset: duplicada ? [{ SolicitudHoraExtraId: 10 }] : [] };
        }
        if (query.includes("INSERT INTO dbo.SolicitudesHorasExtras")) {
          eventos.push("crear");
          return { recordset: [{ SolicitudHoraExtraId: 11, FechaSolicitada: new Date(datos.fechaSolicitada) }] };
        }
        assert.match(query, /INSERT INTO dbo.Bitacora/);
        eventos.push("bitacora");
        return { rowsAffected: [1] };
      },
    };
  });
  try {
    await assert.rejects(crearSolicitudHorasExtras(usuario, datos), { status: 409 });
    assert.deepEqual(eventos, ["consultar", "rollback"]);
    duplicada = false;
    eventos.length = 0;
    await crearSolicitudHorasExtras(usuario, datos);
    assert.deepEqual(eventos, ["consultar", "crear", "bitacora", "commit"]);
  } finally {
    mock.restoreAll();
  }
});
