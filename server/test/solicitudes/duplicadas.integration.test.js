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
  crearSolicitudHorasExtras,
  getSolicitudesByColaborador
} = await import("../../src/modules/extras/horasExtras.service.js");
const {
  obtenerCalendarioActual
} = await import("../../src/shared/utils/fechaUtils.js");
test("consultar rechaza solo pendientes vencidas y aplica el filtro después", async () => {
  const {
    fechaHoy
  } = obtenerCalendarioActual();
  const registros = [{
    SolicitudId: 1,
    FechaSolicitada: new Date("2000-01-01"),
    Estado: "PENDIENTE"
  }, {
    SolicitudId: 2,
    FechaSolicitada: new Date(fechaHoy),
    Estado: "PENDIENTE"
  }, {
    SolicitudId: 3,
    FechaSolicitada: new Date("2099-01-01"),
    Estado: "PENDIENTE"
  }, {
    SolicitudId: 4,
    FechaSolicitada: new Date("2000-01-01"),
    Estado: "APROBADA"
  }];
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  let lecturas = 0;
  jest.spyOn(pool, "request").mockImplementation(() => {
    const params = {};
    return {
      input(name, type, value) {
        params[name] = value;
        return this;
      },
      async query(query) {
        if (query.includes("UPDATE s")) {
          expect(params.colaboradorId).toBe(4);
          expect(params.fechaHoy).toBe(fechaHoy);
          expect(query).toMatch(/s.Estado = 'PENDIENTE'[\s\S]*d.FechaSolicitada < @fechaHoy/);
          expect(query).toMatch(/ColaboradorId = @colaboradorId/);
          for (const solicitud of registros) {
            if (solicitud.Estado === "PENDIENTE" && solicitud.FechaSolicitada < new Date(fechaHoy)) solicitud.Estado = "RECHAZADA";
          }
          return {
            rowsAffected: [1]
          };
        }
        lecturas++;
        expect(params.colaboradorId).toBe(4);
        return {
          recordset: registros.filter(row => row.Estado === params.estado)
        };
      }
    };
  });
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => pool.request());
  try {
    const resultado = await getSolicitudesByColaborador(4, {
      estado: "RECHAZADA"
    }, {
      Rol: "COLABORADOR",
      ColaboradorId: 4
    });
    expect(resultado.map(row => row.SolicitudId)).toEqual([1]);
    expect(lecturas).toBe(1);
    expect(registros.map(row => row.Estado)).toEqual(["RECHAZADA", "PENDIENTE", "PENDIENTE", "APROBADA"]);
  } finally {
    jest.restoreAllMocks();
  }
});
test("crear solicitud rechaza hoy y fechas anteriores antes de consultar la base", async () => {
  const {
    fechaHoy
  } = obtenerCalendarioActual();
  for (const fechaSolicitada of [fechaHoy, "2000-01-01"]) {
    await assert.rejects(crearSolicitudHorasExtras({
      UsuarioId: 7,
      ColaboradorId: 4,
      Rol: "COLABORADOR"
    }, {
      fechaSolicitada,
      minutosSolicitados: 60,
      motivo: "Cierre"
    }), {
      status: 400,
      message: "La fecha solicitada debe ser posterior al día de hoy."
    });
  }
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
