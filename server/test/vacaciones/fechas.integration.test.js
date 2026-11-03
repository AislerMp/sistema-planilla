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
  pool,
  sql
} = await import("../../src/shared/config/database.js");
const {
  solicitarVacaciones
} = await import("../../src/modules/vacaciones/services/vacaciones.service.js");
const usuario = {
  UsuarioId: 7,
  ColaboradorId: 2018
};
function prepararBD(fechaInicio) {
  const eventos = [];
  const solicitud = {
    SolicitudId: 31,
    ColaboradorId: 2018,
    RestauranteId: 2,
    Estado: "PENDIENTE",
    FechaInicio: new Date(`${fechaInicio}T00:00:00Z`),
    FechaFin: new Date(`${fechaInicio}T00:00:00Z`),
    DiasSolicitados: 1
  };
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  for (const operacion of ["begin", "commit", "rollback"]) {
    jest.spyOn(sql.Transaction.prototype, operacion).mockImplementation(async () => eventos.push(operacion));
  }
  const request = () => ({
    input() {
      return this;
    },
    async query(query) {
      eventos.push(query);
      if (query.includes("SELECT * FROM Colaboradores")) {
        return {
          recordset: [{
            ColaboradorId: 2018,
            RestauranteId: 2
          }]
        };
      }
      if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
        recordset: [{
          ColaboradorId: 2018
        }]
      };
      if (query.includes("SELECT TOP (1) s.SolicitudId")) return {
        recordset: []
      };
      if (query.includes("FROM dbo.Vacaciones")) return {
        recordset: []
      };
      if (query.includes("FROM dbo.Incapacidades")) return { recordset: [] };
      if (query.includes("FROM dbo.SaldosVacaciones")) return {
        recordset: [{
          DiasDisponibles: 20
        }]
      };
      if (query.includes("INSERT INTO dbo.Solicitudes")) return {
        recordset: [{
          SolicitudId: 31
        }]
      };
      if (query.includes("INSERT INTO dbo.Vacaciones")) return {
        rowsAffected: [1]
      };
      if (query.includes("FROM dbo.Solicitudes AS s")) return {
        recordset: [solicitud]
      };
      if (query.includes("INSERT INTO dbo.Bitacora")) return {
        rowsAffected: [1]
      };
      assert.fail(`Consulta no esperada: ${query}`);
    }
  });
  jest.spyOn(pool, "request").mockImplementation(request);
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(request);
  return eventos;
}
for (const fechaInicio of ["2026-10-12", "2026-10-16", "2026-10-18"]) {
  test(`rechaza ${fechaInicio}, dentro de la semana actual, antes de iniciar la transacción`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-16T18:00:00Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const eventos = prepararBD(fechaInicio);
    await assert.rejects(solicitarVacaciones({
      fechaInicio,
      fechaFin: fechaInicio
    }, usuario), {
      status: 400,
      message: "La fecha de inicio de las vacaciones no puede estar dentro de la semana actual (de lunes a domingo)."
    });
    assert.equal(eventos.length, 1, "Solo se consulta el colaborador");
    expect(eventos.includes("begin")).toBe(false);
  });
}
for (const caso of [{
  nombre: "lunes próximo",
  ahora: "2026-10-16T18:00:00Z",
  inicio: "2026-10-19",
  permitido: true
}, {
  nombre: "lunes UTC que aún es domingo en Costa Rica",
  ahora: "2026-10-19T05:59:59Z",
  inicio: "2026-10-19",
  permitido: true
}, {
  nombre: "lunes a medianoche de Costa Rica",
  ahora: "2026-10-19T06:00:00Z",
  inicio: "2026-10-19",
  permitido: false
}, {
  nombre: "lunes antes del corte de marcas",
  ahora: "2026-10-19T08:00:00Z",
  inicio: "2026-10-19",
  permitido: false
}, {
  nombre: "domingo antes de terminar la semana",
  ahora: "2026-10-19T05:59:59Z",
  inicio: "2026-10-18",
  permitido: false
}, {
  nombre: "domingo de una semana que cruza el año",
  ahora: "2026-12-31T18:00:00Z",
  inicio: "2027-01-03",
  permitido: false
}, {
  nombre: "lunes próximo al cruzar el año",
  ahora: "2026-12-31T18:00:00Z",
  inicio: "2027-01-04",
  permitido: true
}]) {
  test(caso.nombre, async () => {
    jest.useFakeTimers({
      now: new Date(caso.ahora),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const eventos = prepararBD(caso.inicio);
    const solicitud = solicitarVacaciones({
      fechaInicio: caso.inicio,
      fechaFin: caso.inicio
    }, usuario);
    if (caso.permitido) {
      expect((await solicitud).SolicitudId).toBe(31);
      expect(eventos.includes("begin")).toBe(true);
      expect(eventos.at(-1)).toBe("commit");
    } else {
      await assert.rejects(solicitud, {
        status: 400
      });
      expect(eventos.includes("begin")).toBe(false);
    }
  });
}
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
