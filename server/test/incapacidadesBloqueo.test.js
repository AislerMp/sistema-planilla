import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});

const { pool, sql } = await import("../src/shared/config/database.js");
const { validarDiaSinIncapacidad } = await import("../src/modules/incapacidades/incapacidades.services.js");
const { registrarEntrada, registrarSalida } = await import("../src/modules/marcas/marcas.service.js");
const { ajustarMinutosAsistencia } = await import("../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");
const { actualizarHorasExtra } = await import("../src/modules/extras/horasExtras.service.js");

for (const estado of ["PENDIENTE", "EN_REVISION_RH", "APROBADA"]) {
  for (const operacion of ["entrada", "salida", "asistencia", "extras"]) {
    test(`${operacion} se bloquea por incapacidad ${estado} antes de escribir`, async (t) => {
      // A las 02:00 de Costa Rica todavía corresponde la jornada del día 6.
      t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T08:00:00Z") });
      const eventos = [];
      let transaccion;
      const colaborador = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
      const gerente = { UsuarioId: 8, Rol: "GERENTE" };
      t.mock.method(pool, "connect", async () => pool);
      t.mock.method(pool, "request", () => ({
        input() { return this; },
        async query(query) {
          if (query.includes("FROM Usuarios")) return { recordset: [{ RestauranteId: 2 }] };
          assert.match(query, /FROM Colaboradores/);
          return { recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }] };
        },
      }));
      t.mock.method(sql.Transaction.prototype, "begin", async function () {
        transaccion = this;
        eventos.push("begin");
      });
      t.mock.method(sql.Transaction.prototype, "commit", async () => eventos.push("commit"));
      t.mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
      t.mock.method(sql.Transaction.prototype, "request", function () {
        assert.equal(this, transaccion);
        const parametros = {};
        return {
          input(name, _type, value) { parametros[name] = value; return this; },
          async query(query) {
            assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE)\b/);
            if (query.includes("FROM dbo.PeriodosPlanilla")) {
              return { recordset: [{ PeriodoId: 1, Estado: "ABIERTO", FechaLimiteAjustes: new Date("2099-12-31") }] };
            }
            if (query.includes("FROM dbo.MarcasAsistencia")) {
              return { recordset: operacion === "salida" ? [{
                MarcaId: 10, FechaAsignada: new Date("2026-10-06"),
                FechaHoraEntrada: new Date("2026-10-07T01:00:00Z"),
              }] : [] };
            }
            if (query.includes("FROM dbo.AsistenciasDiarias")) {
              return { recordset: [{
                AsistenciaId: 3, ColaboradorId: 4, RestauranteId: 2, PeriodoId: 1,
                FechaAsignada: new Date("2026-10-06"), MinutosEfectivos: 480,
              }] };
            }
            if (query.includes("FROM dbo.PermisosLaborales")) return { recordset: [] };
            assert.match(query, /FROM dbo.Incapacidades/);
            assert.equal(parametros.colaboradorId, 4);
            assert.equal(parametros.fechaAsignada.toISOString(), "2026-10-06T00:00:00.000Z");
            eventos.push("incapacidad");
            return { recordset: [{ SolicitudId: 31, Estado: estado }] };
          },
        };
      });

      const operaciones = {
        entrada: () => registrarEntrada(colaborador),
        salida: () => registrarSalida(colaborador),
        asistencia: () => ajustarMinutosAsistencia(3, 480, "Corrección", gerente),
        extras: () => actualizarHorasExtra(3, 60, "Corrección", gerente),
      };
      await assert.rejects(operaciones[operacion](), (error) => {
        assert.equal(error.status, 409);
        assert.match(error.message, /incapacidad pendiente, en revisión de RH o aprobada/);
        return true;
      });
      assert.deepEqual(eventos, ["begin", "incapacidad", "rollback"]);
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
          input(name, _type, value) { parametros[name] = value; return this; },
          async query(query) {
            consultas++;
            assert.match(query, /s.ColaboradorId = @colaboradorId/);
            assert.match(query, /s.TipoSolicitud = 'INCAPACIDAD'/);
            assert.match(query, /@fechaAsignada BETWEEN i.FechaInicio AND i.FechaFin/);
            const estados = query.match(/s\.Estado IN\s*\(([^)]+)\)/)[1];
            assert.deepEqual([...estados.matchAll(/'([^']+)'/g)].map((match) => match[1]),
              ["PENDIENTE", "EN_REVISION_RH", "APROBADA"]);
            assert.equal(parametros.colaboradorId, 4);
            assert.equal(parametros.fechaAsignada.toISOString(), "2026-10-06T00:00:00.000Z");
            // SQL excluye las rechazadas y las solicitudes fuera del rango.
            return { recordset: [] };
          },
        };
      },
    };
    await validarDiaSinIncapacidad("4", fecha, transaction);
    assert.equal(consultas, 1);
  });
}

test("validación exige transacción, colaborador y fecha válidos antes de consultar", async () => {
  const transaction = { request() { assert.fail("No debe consultar SQL"); } };
  await assert.rejects(validarDiaSinIncapacidad(4, "2026-10-06"), { status: 500 });
  await assert.rejects(validarDiaSinIncapacidad(0, "2026-10-06", transaction), { status: 400 });
  await assert.rejects(validarDiaSinIncapacidad(4, "2026-02-30", transaction), { status: 400 });
});
