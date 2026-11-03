import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
});
const { pool, sql } = await import("../../src/shared/config/database.js");
const { actualizarHorasExtra, resolverSolicitudHorasExtras } =
  await import("../../src/modules/extras/horasExtras.service.js");
for (const Estado of [
  "ABIERTO",
  "EN_REVISION",
  "PROGRAMADO",
  "CERRADO",
  "PAGADO",
]) {
  for (const vencido of [false, true]) {
    test(`ajustes extras: ${Estado}, ${vencido ? "jueves sin tarea ejecutada" : "miércoles completo"}`, async () => {
      jest.useFakeTimers({
        now: new Date(
          vencido ? "2026-10-29T06:00:00Z" : "2026-10-29T05:59:59Z",
        ),
        doNotFake: [
          "performance",
          "hrtime",
          "nextTick",
          "queueMicrotask",
          "setImmediate",
          "clearImmediate",
          "setInterval",
          "clearInterval",
          "setTimeout",
          "clearTimeout",
        ],
      });
      let escrituras = 0;
      jest.spyOn(pool, "connect").mockImplementation(async () => pool);
      jest.spyOn(pool, "request").mockImplementation(() => ({
        input() {
          return this;
        },
        async query(query) {
          // Estos escenarios previos no tienen vacaciones superpuestas.
          if (query.includes("FROM dbo.Vacaciones"))
            return {
              recordset: [],
            };
          if (
            query.includes("FROM dbo.Colaboradores") &&
            query.includes("WITH (UPDLOCK, HOLDLOCK)")
          )
            return {
              recordset: [
                {
                  ColaboradorId: 4,
                },
              ],
            };
          expect(query).toMatch(/FROM Usuarios/);
          return {
            recordset: [
              {
                RestauranteId: 2,
              },
            ],
          };
        },
      }));
      jest
        .spyOn(sql.Transaction.prototype, "begin")
        .mockImplementation(async () => {});
      jest
        .spyOn(sql.Transaction.prototype, "commit")
        .mockImplementation(async () => {});
      jest
        .spyOn(sql.Transaction.prototype, "rollback")
        .mockImplementation(async () => {});
      jest
        .spyOn(sql.Transaction.prototype, "request")
        .mockImplementation(() => ({
          input() {
            return this;
          },
          async query(query) {
            // Estos escenarios previos no tienen vacaciones superpuestas.
            if (query.includes("FROM dbo.Vacaciones"))
              return {
                recordset: [],
              };
            if (
              query.includes("FROM dbo.Colaboradores") &&
              query.includes("WITH (UPDLOCK, HOLDLOCK)")
            )
              return {
                recordset: [
                  {
                    ColaboradorId: 4,
                  },
                ],
              };
            if (query.includes("FROM dbo.AsistenciasDiarias"))
              return {
                recordset: [
                  {
                    AsistenciaId: 3,
                    ColaboradorId: 4,
                    FechaAsignada: new Date("2026-10-25"),
                    RestauranteId: 2,
                    PeriodoId: 1,
                    MinutosEfectivos: 480,
                  },
                ],
              };
            if (query.includes("FROM dbo.PeriodosPlanilla"))
              return {
                recordset: [
                  {
                    Estado,
                    FechaLimiteAjustes: new Date("2026-10-28"),
                  },
                ],
              };
            if (
              query.includes("FROM dbo.PermisosLaborales") ||
              query.includes("FROM dbo.Incapacidades")
            )
              return {
                recordset: [],
              };
            if (query.includes("FROM dbo.HorasExtras"))
              return {
                recordset: [
                  {
                    HoraExtraId: 9,
                    AsistenciaId: 3,
                    MinutosDetectados: 60,
                    MinutosAjustados: null,
                  },
                ],
              };
            escrituras++;
            if (query.includes("UPDATE dbo.HorasExtras"))
              return {
                recordset: [
                  {
                    HoraExtraId: 9,
                    AsistenciaId: 3,
                    MinutosDetectados: 60,
                    MinutosAjustados: 0,
                  },
                ],
              };
            expect(query).toMatch(/INSERT INTO dbo.Bitacora/);
            return {
              rowsAffected: [1],
            };
          },
        }));
      const operacion = actualizarHorasExtra(3, 0, "Corrección", {
        UsuarioId: 7,
        Rol: "GERENTE",
      });
      if (!vencido && ["ABIERTO", "EN_REVISION"].includes(Estado)) {
        const resultado = await operacion;
        expect(resultado.MinutosExtras).toBe(0);
        expect(escrituras).toBe(2);
      } else {
        await assert.rejects(operacion, {
          status: 409,
        });
        expect(escrituras).toBe(0);
      }
    });
  }
}
test("actualizar horas extras confirma o revierte junto con la bitacora", async () => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones"))
        return {
          recordset: [],
        };
      if (
        query.includes("FROM dbo.Colaboradores") &&
        query.includes("WITH (UPDLOCK, HOLDLOCK)")
      )
        return {
          recordset: [
            {
              ColaboradorId: 4,
            },
          ],
        };
      expect(query).toMatch(/FROM Usuarios/);
      return {
        recordset: [
          {
            RestauranteId: 2,
          },
        ],
      };
    },
  }));
  const gerente = {
    UsuarioId: 7,
    Rol: "GERENTE",
  };
  let events;
  let scenario;
  let activeTransaction;
  const previous = {
    HoraExtraId: 9,
    AsistenciaId: 3,
    MinutosDetectados: 60,
    MinutosAjustados: null,
  };
  const updated = {
    ...previous,
    MinutosAjustados: 0,
  };
  const auditError = new Error("Fallo al guardar bitacora");
  jest
    .spyOn(sql.Transaction.prototype, "begin")
    .mockImplementation(async function () {
      activeTransaction = this;
      events.push("begin");
    });
  jest
    .spyOn(sql.Transaction.prototype, "commit")
    .mockImplementation(async () => events.push("commit"));
  jest
    .spyOn(sql.Transaction.prototype, "rollback")
    .mockImplementation(async () => events.push("rollback"));
  jest
    .spyOn(sql.Transaction.prototype, "request")
    .mockImplementation(function () {
      expect(this).toBe(activeTransaction);
      const parameters = {};
      return {
        input(name, type, value) {
          parameters[name] = value;
          return this;
        },
        async query(query) {
          // Estos escenarios previos no tienen vacaciones superpuestas.
          if (query.includes("FROM dbo.Vacaciones"))
            return {
              recordset: [],
            };
          if (
            query.includes("FROM dbo.Colaboradores") &&
            query.includes("WITH (UPDLOCK, HOLDLOCK)")
          )
            return {
              recordset: [
                {
                  ColaboradorId: 4,
                },
              ],
            };
          if (query.includes("FROM dbo.AsistenciasDiarias")) {
            return {
              recordset: [
                {
                  AsistenciaId: 3,
                  ColaboradorId: 4,
                  FechaAsignada: new Date("2026-10-01"),
                  RestauranteId: 2,
                  PeriodoId: 1,
                  MinutosEfectivos: 480,
                },
              ],
            };
          }
          if (query.includes("FROM dbo.PeriodosPlanilla")) {
            return {
              recordset: [
                {
                  Estado: "ABIERTO",
                  FechaLimiteAjustes: new Date("2099-12-31"),
                },
              ],
            };
          }
          if (query.includes("FROM dbo.PermisosLaborales"))
            return {
              recordset: [],
            };
          if (query.includes("FROM dbo.Incapacidades"))
            return {
              recordset: [],
            };
          if (query.includes("SELECT")) {
            events.push("read");
            return {
              recordset: [previous],
            };
          }
          if (query.includes("UPDATE dbo.HorasExtras")) {
            events.push("update");
            expect(parameters.asistenciaId).toBe(3);
            expect(parameters.minutosAjustados).toBe(0);
            return {
              recordset: scenario === "missing" ? [] : [updated],
            };
          }
          expect(query).toMatch(/INSERT INTO dbo.Bitacora/);
          events.push("audit");
          expect(parameters.UsuarioId).toBe(7);
          expect(parameters.Entidad).toBe("HorasExtras");
          expect(parameters.RegistroId).toBe(9);
          expect(parameters.Accion).toBe("AJUSTAR_HORAS");
          expect(JSON.parse(parameters.DatosAnteriores)).toEqual({
            asistenciaId: 3,
            minutosDetectados: 60,
            minutosAjustados: null,
          });
          expect(JSON.parse(parameters.DatosNuevos)).toEqual({
            asistenciaId: 3,
            minutosDetectados: 60,
            minutosAjustados: 0,
            motivo: "Correccion",
          });
          if (scenario === "auditFailure") throw auditError;
          return {
            rowsAffected: [1],
          };
        },
      };
    });
  try {
    events = [];
    await assert.rejects(actualizarHorasExtra(3, -1, "Correccion", gerente), {
      status: 400,
    });
    expect(events).toEqual([]);
    expect(await actualizarHorasExtra(3, 0, "Correccion", gerente)).toEqual({
      ...updated,
      MinutosEfectivos: 480,
      MinutosExtras: 0,
    });
    expect(events).toEqual(["begin", "read", "update", "audit", "commit"]);
    events = [];
    scenario = "auditFailure";
    await assert.rejects(
      actualizarHorasExtra(3, 0, "Correccion", gerente),
      (error) => error === auditError,
    );
    expect(events).toEqual(["begin", "read", "update", "audit", "rollback"]);
    events = [];
    scenario = "missing";
    await assert.rejects(actualizarHorasExtra(3, 0, "Correccion", gerente), {
      status: 500,
    });
    expect(events).toEqual(["begin", "read", "update", "rollback"]);
  } finally {
    jest.restoreAllMocks();
  }
});
test("resolver solicitud registra snapshots anterior y nuevo en la bitacora", async () => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  const solicitudAnterior = {
    SolicitudId: 12,
    ColaboradorId: 4,
    RestauranteId: 2,
    FechaSolicitada: new Date("2099-06-15T00:00:00.000Z"),
    MinutosSolicitados: 120,
    Motivo: "Cierre tardío",
    Estado: "PENDIENTE",
    MinutosAutorizados: null,
    RevisadoPorGerenteId: null,
    Observacion: null,
  };
  const solicitudActualizada = {
    ...solicitudAnterior,
    Estado: "APROBADA",
    MinutosAutorizados: 90,
    RevisadoPorGerenteId: 7,
    Observacion: "Aprobado",
  };
  const events = [];
  let activeTransaction;
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones"))
        return {
          recordset: [],
        };
      if (
        query.includes("FROM dbo.Colaboradores") &&
        query.includes("WITH (UPDLOCK, HOLDLOCK)")
      )
        return {
          recordset: [
            {
              ColaboradorId: 4,
            },
          ],
        };
      if (query.includes("FROM Usuarios"))
        return {
          recordset: [
            {
              RestauranteId: 2,
            },
          ],
        };
      expect(query).toMatch(/FROM dbo\.SolicitudesHorasExtras/);
      events.push("read");
      return {
        recordset: [solicitudAnterior],
      };
    },
  }));
  jest
    .spyOn(sql.Transaction.prototype, "begin")
    .mockImplementation(async function () {
      activeTransaction = this;
      events.push("begin");
    });
  jest
    .spyOn(sql.Transaction.prototype, "commit")
    .mockImplementation(async () => events.push("commit"));
  jest
    .spyOn(sql.Transaction.prototype, "rollback")
    .mockImplementation(async () => events.push("rollback"));
  jest
    .spyOn(sql.Transaction.prototype, "request")
    .mockImplementation(function () {
      expect(this).toBe(activeTransaction);
      const parameters = {};
      return {
        input(name, type, value) {
          parameters[name] = value;
          return this;
        },
        async query(query) {
          // Estos escenarios previos no tienen vacaciones superpuestas.
          if (query.includes("FROM dbo.Vacaciones"))
            return {
              recordset: [],
            };
          if (
            query.includes("FROM dbo.Colaboradores") &&
            query.includes("WITH (UPDLOCK, HOLDLOCK)")
          )
            return {
              recordset: [
                {
                  ColaboradorId: 4,
                },
              ],
            };
          if (query.includes("OUTPUT INSERTED.SolicitudId")) {
            events.push("update");
            expect(parameters.estado).toBe("APROBADA");
            return {
              recordset: [solicitudActualizada],
            };
          }
          if (query.includes("UPDATE d")) {
            events.push("detail");
            expect(parameters.minutosAutorizados).toBe(90);
            expect(query).toMatch(/s.TipoSolicitud = 'HORAS_EXTRAS'/);
            return {
              rowsAffected: [1],
            };
          }
          if (query.includes("SELECT")) {
            events.push("readUpdated");
            return {
              recordset: [solicitudActualizada],
            };
          }
          expect(query).toMatch(/INSERT INTO dbo\.Bitacora/);
          events.push("audit");
          expect(parameters.RegistroId).toBe(12);
          expect(parameters.Accion).toBe("APROBAR_HORAS_EXTRA");
          expect(parameters.Entidad).toBe("Solicitudes");
          expect(JSON.parse(parameters.DatosAnteriores)).toEqual(
            JSON.parse(JSON.stringify(solicitudAnterior)),
          );
          expect(JSON.parse(parameters.DatosNuevos)).toEqual(
            JSON.parse(JSON.stringify(solicitudActualizada)),
          );
          return {
            rowsAffected: [1],
          };
        },
      };
    });
  try {
    const resultado = await resolverSolicitudHorasExtras(
      12,
      {
        estado: "APROBADA",
        minutosAutorizados: 90,
        observacion: "Aprobado",
      },
      {
        UsuarioId: 7,
        Rol: "GERENTE",
      },
    );
    expect(resultado).toEqual(solicitudActualizada);
    expect(events).toEqual([
      "read",
      "begin",
      "update",
      "detail",
      "readUpdated",
      "audit",
      "commit",
    ]);
  } finally {
    jest.restoreAllMocks();
  }
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
