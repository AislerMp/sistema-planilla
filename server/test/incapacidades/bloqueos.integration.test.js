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
  validarDiaSinIncapacidad
} = await import("../../src/modules/incapacidades/services/incapacidades.services.js");
const {
  registrarEntrada,
  registrarSalida
} = await import("../../src/modules/marcas/marcas.service.js");
const {
  ajustarMinutosAsistencia
} = await import("../../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");
const {
  actualizarHorasExtra
} = await import("../../src/modules/extras/horasExtras.service.js");
for (const estado of ["PENDIENTE", "EN_REVISION_RH", "APROBADA"]) {
  for (const operacion of ["entrada", "salida", "asistencia", "extras"]) {
    test(`${operacion} se bloquea por incapacidad ${estado} antes de escribir`, async () => {
      // A las 02:00 de Costa Rica todavía corresponde la jornada del día 6.
      jest.useFakeTimers({
        now: new Date("2026-10-07T08:00:00Z"),
        doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
      });
      const eventos = [];
      let transaccion;
      const colaborador = {
        UsuarioId: 7,
        ColaboradorId: 4,
        Rol: "COLABORADOR"
      };
      const gerente = {
        UsuarioId: 8,
        Rol: "GERENTE"
      };
      jest.spyOn(pool, "connect").mockImplementation(async () => pool);
      jest.spyOn(pool, "request").mockImplementation(() => ({
        input() {
          return this;
        },
        async query(query) {
          if (query.includes("FROM Usuarios")) return {
            recordset: [{
              RestauranteId: 2
            }]
          };
          expect(query).toMatch(/FROM Colaboradores/);
          return {
            recordset: [{
              ColaboradorId: 4,
              RestauranteId: 2,
              Activo: true
            }]
          };
        }
      }));
      jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async function () {
        transaccion = this;
        eventos.push("begin");
      });
      jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => eventos.push("commit"));
      jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => eventos.push("rollback"));
      jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
        expect(this).toBe(transaccion);
        const parametros = {};
        return {
          input(name, _type, value) {
            parametros[name] = value;
            return this;
          },
          async query(query) {
            assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE)\b/);
            if (query.includes("FROM dbo.Colaboradores") && query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
              recordset: [{
                ColaboradorId: 4
              }]
            };
            if (query.includes("FROM dbo.PeriodosPlanilla")) {
              return {
                recordset: [{
                  PeriodoId: 1,
                  Estado: "ABIERTO",
                  FechaLimiteAjustes: new Date("2099-12-31")
                }]
              };
            }
            if (query.includes("FROM dbo.MarcasAsistencia")) {
              return {
                recordset: operacion === "salida" ? [{
                  MarcaId: 10,
                  FechaAsignada: new Date("2026-10-06"),
                  FechaHoraEntrada: new Date("2026-10-07T01:00:00Z")
                }] : []
              };
            }
            if (query.includes("FROM dbo.AsistenciasDiarias")) {
              return {
                recordset: [{
                  AsistenciaId: 3,
                  ColaboradorId: 4,
                  RestauranteId: 2,
                  PeriodoId: 1,
                  FechaAsignada: new Date("2026-10-06"),
                  MinutosEfectivos: 480
                }]
              };
            }
            if (query.includes("FROM dbo.PermisosLaborales")) return {
              recordset: []
            };
            expect(query).toMatch(/FROM dbo.Incapacidades/);
            expect(parametros.colaboradorId).toBe(4);
            expect(parametros.fechaAsignada.toISOString()).toBe("2026-10-06T00:00:00.000Z");
            eventos.push("incapacidad");
            return {
              recordset: [{
                SolicitudId: 31,
                Estado: estado
              }]
            };
          }
        };
      });
      const operaciones = {
        entrada: () => registrarEntrada(colaborador),
        salida: () => registrarSalida(colaborador),
        asistencia: () => ajustarMinutosAsistencia(3, 480, "Corrección", gerente),
        extras: () => actualizarHorasExtra(3, 60, "Corrección", gerente)
      };
      await assert.rejects(operaciones[operacion](), error => {
        expect(error.status).toBe(409);
        expect(error.message).toMatch(/incapacidad pendiente, en revisión de RH o aprobada/);
        return true;
      });
      expect(eventos).toEqual(["begin", "incapacidad", "rollback"]);
    });
  }
}
for (const fecha of ["2026-10-06", new Date("2026-10-06T00:00:00Z")]) {
  test(`validación acepta fecha ${typeof fecha} y continúa sin incapacidad vigente`, async () => {
    let consultas = 0;
    const transaction = {
      request() {
        const parametros = {};
        return {
          input(name, _type, value) {
            parametros[name] = value;
            return this;
          },
          async query(query) {
            consultas++;
            expect(query).toMatch(/s.ColaboradorId = @colaboradorId/);
            expect(query).toMatch(/s.TipoSolicitud = 'INCAPACIDAD'/);
            expect(query).toMatch(/@fechaAsignada BETWEEN i.FechaInicio AND i.FechaFin/);
            const estados = query.match(/s\.Estado IN\s*\(([^)]+)\)/)[1];
            expect([...estados.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(["PENDIENTE", "EN_REVISION_RH", "APROBADA"]);
            expect(parametros.colaboradorId).toBe(4);
            expect(parametros.fechaAsignada.toISOString()).toBe("2026-10-06T00:00:00.000Z");
            // SQL excluye las rechazadas y las solicitudes fuera del rango.
            return {
              recordset: []
            };
          }
        };
      }
    };
    await validarDiaSinIncapacidad("4", fecha, transaction);
    expect(consultas).toBe(1);
  });
}
test("validación exige transacción, colaborador y fecha válidos antes de consultar", async () => {
  const transaction = {
    request() {
      assert.fail("No debe consultar SQL");
    }
  };
  await assert.rejects(validarDiaSinIncapacidad(4, "2026-10-06"), {
    status: 500
  });
  await assert.rejects(validarDiaSinIncapacidad(0, "2026-10-06", transaction), {
    status: 400
  });
  await assert.rejects(validarDiaSinIncapacidad(4, "2026-02-30", transaction), {
    status: 400
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
