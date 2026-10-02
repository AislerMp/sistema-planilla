import assert from "node:assert/strict";
import { test, mock } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const {
  actualizarHorasExtra,
  resolverSolicitudHorasExtras,
} = await import("../src/modules/extras/horasExtras.service.js");

test("actualizar horas extras confirma o revierte junto con la bitacora", async () => {
  mock.method(pool, "connect", async () => pool);
  mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /FROM Usuarios/);
      return { recordset: [{ RestauranteId: 2 }] };
    },
  }));
  const gerente = { UsuarioId: 7, Rol: "GERENTE" };
  let events;
  let scenario;
  let activeTransaction;
  const previous = { HoraExtraId: 9, AsistenciaId: 3, MinutosDetectados: 60, MinutosAjustados: null };
  const updated = { ...previous, MinutosAjustados: 0 };
  const auditError = new Error("Fallo al guardar bitacora");
  mock.method(sql.Transaction.prototype, "begin", async function () {
    activeTransaction = this;
    events.push("begin");
  });
  mock.method(sql.Transaction.prototype, "commit", async () => events.push("commit"));
  mock.method(sql.Transaction.prototype, "rollback", async () => events.push("rollback"));
  mock.method(sql.Transaction.prototype, "request", function () {
    assert.equal(this, activeTransaction);
    const parameters = {};
    return {
      input(name, type, value) { parameters[name] = value; return this; },
      async query(query) {
        if (query.includes("FROM dbo.AsistenciasDiarias")) {
          return { recordset: [{ AsistenciaId: 3, RestauranteId: 2, PeriodoId: 1, MinutosEfectivos: 480 }] };
        }
        if (query.includes("FROM dbo.PeriodosPlanilla")) {
          return { recordset: [{ Estado: "ABIERTO", FechaLimiteAjustes: new Date("2099-12-31") }] };
        }
        if (query.includes("SELECT")) {
          events.push("read");
          return { recordset: [previous] };
        }
        if (query.includes("UPDATE dbo.HorasExtras")) {
          events.push("update");
          assert.equal(parameters.asistenciaId, 3);
          assert.equal(parameters.minutosAjustados, 0);
          return { recordset: scenario === "missing" ? [] : [updated] };
        }
        assert.match(query, /INSERT INTO dbo.Bitacora/);
        events.push("audit");
        assert.equal(parameters.UsuarioId, 7);
        assert.equal(parameters.Entidad, "HorasExtras");
        assert.equal(parameters.RegistroId, 9);
        assert.equal(parameters.Accion, "AJUSTAR_HORAS");
        assert.deepEqual(JSON.parse(parameters.DatosAnteriores), { asistenciaId: 3, minutosDetectados: 60, minutosAjustados: null });
        assert.deepEqual(JSON.parse(parameters.DatosNuevos), { asistenciaId: 3, minutosDetectados: 60, minutosAjustados: 0, motivo: "Correccion" });
        if (scenario === "auditFailure") throw auditError;
        return { rowsAffected: [1] };
      },
    };
  });
  try {
    events = [];
    await assert.rejects(actualizarHorasExtra(3, -1, "Correccion", gerente), { status: 400 });
    assert.deepEqual(events, []);

    assert.deepEqual(await actualizarHorasExtra(3, 0, "Correccion", gerente), { ...updated, MinutosEfectivos: 480, MinutosExtras: 0 });
    assert.deepEqual(events, ["begin", "read", "update", "audit", "commit"]);

    events = [];
    scenario = "auditFailure";
    await assert.rejects(actualizarHorasExtra(3, 0, "Correccion", gerente), error => error === auditError);
    assert.deepEqual(events, ["begin", "read", "update", "audit", "rollback"]);

    events = [];
    scenario = "missing";
    await assert.rejects(actualizarHorasExtra(3, 0, "Correccion", gerente), { status: 500 });
    assert.deepEqual(events, ["begin", "read", "update", "rollback"]);
  } finally {
    mock.restoreAll();
  }
});

test("resolver solicitud registra snapshots anterior y nuevo en la bitacora", async () => {
  mock.method(pool, "connect", async () => pool);
  const solicitudAnterior = {
    SolicitudHoraExtraId: 12,
    ColaboradorId: 4,
    RestauranteId: 2,
    FechaSolicitada: new Date("2099-06-15T00:00:00.000Z"),
    MinutosSolicitados: 120,
    Motivo: "Cierre tardío",
    Estado: "PENDIENTE",
    MinutosAutorizados: null,
    RevisadoPorUsuarioId: null,
    Observacion: null,
  };
  const solicitudActualizada = {
    ...solicitudAnterior,
    Estado: "APROBADA",
    MinutosAutorizados: 90,
    RevisadoPorUsuarioId: 7,
    Observacion: "Aprobado",
  };
  const events = [];
  let activeTransaction;

  mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /FROM dbo\.SolicitudesHorasExtras/);
      events.push("read");
      return { recordset: [solicitudAnterior] };
    },
  }));
  mock.method(sql.Transaction.prototype, "begin", async function () {
    activeTransaction = this;
    events.push("begin");
  });
  mock.method(sql.Transaction.prototype, "commit", async () => events.push("commit"));
  mock.method(sql.Transaction.prototype, "rollback", async () => events.push("rollback"));
  mock.method(sql.Transaction.prototype, "request", function () {
    assert.equal(this, activeTransaction);
    const parameters = {};
    return {
      input(name, type, value) { parameters[name] = value; return this; },
      async query(query) {
        if (query.includes("UPDATE dbo.SolicitudesHorasExtras")) {
          events.push("update");
          assert.equal(parameters.estado, "APROBADA");
          return { recordset: [solicitudActualizada] };
        }

        assert.match(query, /INSERT INTO dbo\.Bitacora/);
        events.push("audit");
        assert.equal(parameters.RegistroId, 12);
        assert.equal(parameters.Accion, "APROBAR_HORAS_EXTRA");
        assert.deepEqual(JSON.parse(parameters.DatosAnteriores), {
          colaboradorId: 4,
          restauranteId: 2,
          fechaSolicitada: "2099-06-15",
          minutosSolicitados: 120,
          motivo: "Cierre tardío",
          estado: "PENDIENTE",
          minutosAutorizados: null,
          revisadoPorUsuarioId: null,
          observacion: null,
        });
        assert.deepEqual(JSON.parse(parameters.DatosNuevos), {
          colaboradorId: 4,
          restauranteId: 2,
          fechaSolicitada: "2099-06-15",
          minutosSolicitados: 120,
          motivo: "Cierre tardío",
          estado: "APROBADA",
          minutosAutorizados: 90,
          revisadoPorUsuarioId: 7,
          observacion: "Aprobado",
        });
        return { rowsAffected: [1] };
      },
    };
  });

  try {
    const resultado = await resolverSolicitudHorasExtras(
      12,
      { estado: "APROBADA", minutosAutorizados: 90, observacion: "Aprobado" },
      { UsuarioId: 7, Rol: "ADMINISTRADOR" },
    );

    assert.deepEqual(resultado, solicitudActualizada);
    assert.deepEqual(events, ["read", "begin", "update", "audit", "commit"]);
  } finally {
    mock.restoreAll();
  }
});
