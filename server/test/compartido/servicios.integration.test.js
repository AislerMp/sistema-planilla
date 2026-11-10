import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import { esperarSaldoInicial } from "../support/saldoInicial.js";
beforeEach(() => {
  let asistenciaFixture;
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => {
    const parameters = {};
    return {
      input(name, type, value) {
        parameters[name] = {
          type,
          value
        };
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        // Estos casos de asistencia no tienen saldo inicializado.
        if (query.includes("FROM dbo.SaldosVacaciones") && !expected[0]?.pattern.test(query)) {
          return { recordset: [] };
        }
        if (query.includes("FROM dbo.Colaboradores") && query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
          recordset: [{
            ColaboradorId: 4
          }]
        };
        const next = expected.shift();
        assert.ok(next, `Consulta inesperada: ${query}`);
        expect(query).toMatch(next.pattern);
        if (query.includes("FROM dbo.AsistenciasDiarias")) asistenciaFixture = next.records?.[0];
        if (query.includes("UPDATE dbo.AsistenciasDiarias") && asistenciaFixture) {
          // OUTPUT INSERTED.* conserva la identidad y fecha de la asistencia.
          next.records = next.records.map(fila => ({ ...asistenciaFixture, ...fila }));
          asistenciaFixture = next.records[0];
        }
        // Las aserciones de datos usan las consultas de negocio; la bitácora también
        // debe estar en la cola esperada. Su atomicidad se prueba por separado.
        if (!query.includes("INSERT INTO dbo.Bitacora")) calls.push({
          query,
          parameters
        });
        if (next.error) throw next.error;
        return {
          recordset: next.records,
          rowsAffected: [next.affected]
        };
      }
    };
  });
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => pool.request());
});
import assert from "node:assert/strict";
import { hash, compare } from "bcrypt";

// Datos ficticios: estas pruebas nunca abren una conexión a SQL Server.
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
const auth = await import("../../src/modules/auth/auth.service.js");
const colaboradores = await import("../../src/modules/colaboradores/colaboradores.service.js");
const saldosVacaciones = await import("../../src/modules/vacaciones/services/saldosVacaciones.service.js");
const puestos = await import("../../src/modules/puestos/puestos.service.js");
const restaurantes = await import("../../src/modules/restaurantes/restaurantes.service.js");
const roles = await import("../../src/modules/roles/roles.service.js");
const ubicaciones = await import("../../src/modules/ubicaciones/ubicaciones.service.js");
const asistencias = await import("../../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");
const marcas = await import("../../src/modules/marcas/marcas.service.js");
const permisos = await import("../../src/modules/permisosLaborales/permisosLaborales.service.js");
const {
  sincronizarHorasExtras
} = await import("../../src/modules/extras/horasExtras.service.js");
const {
  obtenerCalendarioActual
} = await import("../../src/shared/utils/fechaUtils.js");
let expected;
let calls;
beforeEach(() => {
  expected = [];
  calls = [];
});
afterEach(() => assert.equal(expected.length, 0, "Faltaron consultas esperadas"));
function respond(pattern, records = [], affected = 1) {
  expected.push({
    pattern,
    records,
    affected
  });
}
test("corte de marcas conserva el 28 hasta las 03:59:59 de Costa Rica", () => {
  for (const [instante, fechaAsignada] of [["2026-09-29T06:00:00Z", "2026-09-28"], ["2026-09-29T09:59:59Z", "2026-09-28"], ["2026-09-29T10:00:00Z", "2026-09-29"]]) {
    expect(obtenerCalendarioActual(new Date(instante)).fechaAsignada).toBe(fechaAsignada);
  }
});
for (const extrasExistentes of [false, true]) {
  test(`salida de madrugada conserva fecha y guarda extras (existentes: ${extrasExistentes})`, async () => {
    const salida = new Date("2026-09-29T08:00:00Z"); // 02:00 en Costa Rica.
    jest.useFakeTimers({
      now: salida,
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const commit = jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
    const rollback = jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {});
    const marca = {
      MarcaId: 10,
      ColaboradorId: 8,
      NumeroIntervalo: 2,
      FechaAsignada: new Date("2026-09-28T00:00:00Z"),
      FechaHoraEntrada: new Date("2026-09-28T23:32:00Z")
    };
    const asistencia = {
      AsistenciaId: 4,
      ColaboradorId: 8,
      PeriodoId: 2,
      TipoJornada: "DIURNA",
      MinutosCalculados: 240,
      MinutosAjustados: null
    };
    const clasificada = {
      ...asistencia,
      TipoJornada: "NOCTURNA"
    };
    const actualizada = {
      ...clasificada,
      MinutosCalculados: 748
    };
    respond(/FROM Colaboradores/, [{
      ColaboradorId: 8,
      Activo: true
    }]);
    respond(/FROM dbo.PeriodosPlanilla/, [{
      PeriodoId: 2,
      Estado: "ABIERTO"
    }]);
    respond(/FROM dbo.MarcasAsistencia/, [marca]);
    respond(/FROM dbo.PermisosLaborales/, []);
    respond(/FROM dbo.Incapacidades/, []);
    respond(/FROM dbo.AsistenciasDiarias/, [asistencia]);
    respond(/UPDATE dbo.MarcasAsistencia/, [{
      ...marca,
      FechaHoraSalida: salida
    }]);
    respond(/FROM dbo.MarcasAsistencia/, [{
      FechaHoraEntrada: new Date("2026-09-28T18:00:00Z"),
      FechaHoraSalida: new Date("2026-09-28T22:00:00Z")
    }, {
      ...marca,
      FechaHoraSalida: salida
    }]);
    respond(/SET TipoJornada = @TipoJornada/, [clasificada]);
    respond(/INSERT INTO dbo.Bitacora/);
    respond(/FROM dbo.AsistenciasDiarias/, [clasificada]);
    respond(/FROM dbo.PeriodosPlanilla/, [{
      PeriodoId: 2,
      Estado: "ABIERTO"
    }]);
    respond(/UPDATE dbo.AsistenciasDiarias/, [actualizada]);
    respond(/INSERT INTO dbo.Bitacora/);
    respond(/FROM dbo.HorasExtras/, extrasExistentes ? [{
      HoraExtraId: 5,
      MinutosDetectados: 0
    }] : []);
    respond(/SET MinutosAjustados = @Minutos/, [{
      ...actualizada,
      MinutosAjustados: 360
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    // Comprueba también la separación de columnas que SQL Server requiere en OUTPUT.
    respond(/(?:INSERT INTO|UPDATE) dbo.HorasExtras[\s\S]*INSERTED.MinutosDetectados,\s*INSERTED.MinutosAjustados/, [{
      HoraExtraId: 5,
      AsistenciaId: 4,
      MinutosDetectados: 388
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    const resultado = await marcas.registrarSalida({
      UsuarioId: 1,
      ColaboradorId: 8,
      Rol: "COLABORADOR"
    });
    expect(resultado.marca.FechaAsignada.toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(resultado.asistencia.MinutosCalculados).toBe(748);
    expect(resultado.asistencia.TipoJornada).toBe("NOCTURNA");
    expect(resultado.asistencia.MinutosAjustados).toBe(360);
    expect(calls[2].parameters.fechaAsignada.value.toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(calls.at(-1).parameters.minutosDetectados.value).toBe(388);
    expect(commit.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(0);
  });
}
test("sincronizar separa las normales aunque las extras no cambien y conserva extras al repetir", async () => {
  const asistencia = {
    AsistenciaId: 4,
    MinutosCalculados: 600,
    MinutosAjustados: null
  };
  const extras = {
    HoraExtraId: 5,
    AsistenciaId: 4,
    MinutosDetectados: 120,
    MinutosAjustados: null
  };
  const transaction = new sql.Transaction(pool);
  respond(/FROM dbo.HorasExtras/, [extras]);
  respond(/SET MinutosAjustados = @Minutos/, [{
    ...asistencia,
    MinutosAjustados: 480
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await sincronizarHorasExtras(asistencia, 1, transaction)).toEqual(extras);
  expect(asistencia.MinutosAjustados).toBe(480);
  expect(calls.at(-1).parameters.Minutos.value).toBe(480);
  respond(/FROM dbo.HorasExtras/, [extras]);
  expect(await sincronizarHorasExtras(asistencia, 1, transaction)).toEqual(extras);
  expect(calls.length).toBe(3); // La segunda sincronización solo consulta.

  asistencia.MinutosCalculados = 720;
  respond(/FROM dbo.HorasExtras/, [extras]);
  respond(/UPDATE dbo.HorasExtras/, [{
    ...extras,
    MinutosDetectados: 240
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  const resultado = await sincronizarHorasExtras(asistencia, 1, transaction);
  expect(resultado.MinutosDetectados).toBe(240);
  expect(calls.at(-1).parameters.minutosDetectados.value).toBe(240);
  expect(asistencia.MinutosAjustados).toBe(480);
});
test("consulta marcas propias usa el colaborador autenticado y permite días vacíos", async () => {
  respond(/FROM dbo.MarcasAsistencia/, []);
  expect(await marcas.consultarMisMarcas({
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  }, {
    desde: "2026-09-21",
    hasta: "2026-09-25"
  })).toEqual([]);
  expect(calls[0].parameters.colaboradorId.value).toBe(8);
  expect(calls[0].parameters.desde.value.toISOString().slice(0, 10)).toBe("2026-09-21");
  expect(calls[0].parameters.hasta.value.toISOString().slice(0, 10)).toBe("2026-09-25");
  expect(calls[0].query).toMatch(/@desde IS NULL OR FechaAsignada >= @desde/);
  expect(calls[0].query).toMatch(/@hasta IS NULL OR FechaAsignada <= @hasta/);
});
test("mis marcas devuelve el historial completo con orden descendente sin fecha", async () => {
  const historial = [{
    MarcaId: 12,
    ColaboradorId: 8,
    FechaAsignada: "2026-09-25"
  }, {
    MarcaId: 11,
    ColaboradorId: 8,
    FechaAsignada: "2026-09-24"
  }];
  respond(/FROM dbo.MarcasAsistencia/, historial);
  expect(await marcas.consultarMisMarcas({
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  })).toEqual(historial);
  expect(calls[0].parameters.colaboradorId.value).toBe(8);
  expect(calls[0].parameters.desde.value).toBe(null);
  expect(calls[0].parameters.hasta.value).toBe(null);
  expect(calls[0].query).toMatch(/WHERE ColaboradorId = @colaboradorId/);
  expect(calls[0].query).toMatch(/ORDER BY FechaAsignada DESC, FechaHoraEntrada DESC, MarcaId DESC/);
  assert.doesNotMatch(calls[0].query, /TOP\s*\(/i);
});
test("mis marcas permite limpiar el filtro y devuelve una lista vacia sin registros", async () => {
  for (const fecha of [undefined, null, ""]) {
    respond(/FROM dbo.MarcasAsistencia/, []);
    expect(await marcas.consultarMisMarcas({
      UsuarioId: 1,
      ColaboradorId: 8,
      Rol: "COLABORADOR"
    }, {
      desde: fecha,
      hasta: fecha
    })).toEqual([]);
    expect(calls.at(-1).parameters.desde.value).toBe(null);
    expect(calls.at(-1).parameters.hasta.value).toBe(null);
  }
});
test("permisos rechaza vencidos antes de filtrar pendientes y usa la fecha de Costa Rica", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-02T03:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  respond(/UPDATE s/);
  respond(/FROM dbo.PermisosLaborales AS d/, []);
  expect(await permisos.listarMisPermisos({
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  }, {
    estado: "PENDIENTE"
  })).toEqual([]);
  expect(calls[0].parameters.fechaHoy.value).toBe("2026-10-01");
  expect(calls[0].parameters.colaboradorId.value).toBe(8);
  expect(calls[0].query).toMatch(/s.Estado = 'PENDIENTE'[\s\S]*d.FechaSolicitada < @fechaHoy/);
  expect(calls[1].parameters.estado.value).toBe("PENDIENTE");
});
test("detalle de permiso comprueba acceso antes de rechazar y devuelve el estado actualizado", async () => {
  const usuario = {
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  };
  const permiso = {
    SolicitudId: 7,
    ColaboradorId: 8,
    Estado: "PENDIENTE"
  };
  respond(/FROM dbo.PermisosLaborales/, [{
    ...permiso,
    ColaboradorId: 9
  }]);
  await assert.rejects(permisos.obtenerPermisoPorId(7, usuario), {
    status: 403
  });
  expect(calls.length).toBe(1);
  respond(/FROM dbo.PermisosLaborales/, [permiso]);
  respond(/UPDATE s/);
  respond(/FROM dbo.PermisosLaborales/, [{
    ...permiso,
    Estado: "RECHAZADA"
  }]);
  expect((await permisos.obtenerPermisoPorId(7, usuario)).Estado).toBe("RECHAZADA");
  expect(calls.at(-2).parameters.solicitudId.value).toBe(7);
});
test("permisos limita el rechazo automático al restaurante permitido", async () => {
  const usuario = {
    UsuarioId: 1,
    Rol: "GERENTE"
  };
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  await assert.rejects(permisos.listarPermisosPorRestaurante(usuario, 3), {
    status: 403
  });
  expect(calls.length).toBe(1);
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/UPDATE s/);
  respond(/FROM dbo.PermisosLaborales AS d/, []);
  await permisos.listarPermisosPorRestaurante(usuario, 2);
  expect(calls.at(-2).parameters.restauranteId.value).toBe(2);
  assert.doesNotMatch(calls.at(-1).query, /MinutosAutorizados/);
});
test("consulta marcas valida sesión, roles y fecha antes de consultar", async () => {
  await assert.rejects(marcas.consultarMisMarcas(null), {
    status: 401
  });
  await assert.rejects(marcas.consultarMisMarcas({
    UsuarioId: 1,
    Rol: "GERENTE"
  }), {
    status: 403
  });
  await assert.rejects(marcas.consultarMisMarcas({
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  }, {
    desde: "2026-02-30"
  }), {
    status: 400
  });
  await assert.rejects(marcas.consultarMarcasColaborador({
    UsuarioId: 1,
    Rol: "COLABORADOR"
  }, 8, "2026-09-21"), {
    status: 403
  });
});
test("consulta marcas del gerente comprueba el restaurante de la asistencia", async () => {
  const usuario = {
    UsuarioId: 1,
    Rol: "GERENTE"
  };
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.AsistenciasDiarias/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.MarcasAsistencia/, [{
    MarcaId: 7
  }]);
  expect(await marcas.consultarMarcasColaborador(usuario, 8, "2026-09-21")).toEqual([{
    MarcaId: 7
  }]);
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.AsistenciasDiarias/, [{
    RestauranteId: 3
  }]);
  await assert.rejects(marcas.consultarMarcasColaborador(usuario, 8, "2026-09-21"), {
    status: 403
  });
});
test("consulta marcas del gerente sin asistencia devuelve vacío y sin asignación rechaza", async () => {
  const usuario = {
    UsuarioId: 1,
    Rol: "GERENTE"
  };
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.AsistenciasDiarias/, []);
  expect(await marcas.consultarMarcasColaborador(usuario, 8, "2026-09-21")).toEqual([]);
  respond(/FROM Usuarios/, []);
  await assert.rejects(marcas.consultarMarcasColaborador(usuario, 8, "2026-09-21"), {
    status: 403
  });
});
test("actualizar minutos rechaza valores invalidos en ambos servicios", async () => {
  const gerente = {
    UsuarioId: 1,
    Rol: "GERENTE"
  };
  const colaborador = {
    UsuarioId: 2,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  };
  const transaction = new sql.Transaction(pool);
  for (const minutos of [-1, 1.5, "60", null, undefined, NaN, Infinity, 2147483648]) {
    await assert.rejects(asistencias.ajustarMinutosAsistencia(1, minutos, "Correccion", gerente), {
      status: 400
    });
    await assert.rejects(asistencias.actualizarMinutosCalculados(1, minutos, transaction, colaborador), {
      status: 400
    });
  }
  await assert.rejects(asistencias.actualizarMinutosCalculados(1, 60, null, colaborador), {
    status: 500
  });
});
for (const minutosDetectados of [60, 120]) {
  test(`ajustar total a diez horas restablece extras manuales (detectados: ${minutosDetectados})`, async () => {
    respond(/FROM Usuarios/, [{
      RestauranteId: 3
    }]);
    respond(/FROM dbo.AsistenciasDiarias/, [{
      AsistenciaId: 1,
      ColaboradorId: 8,
      FechaAsignada: new Date("2026-10-01"),
      PeriodoId: 2,
      RestauranteId: 3,
      MinutosCalculados: 660,
      MinutosAjustados: null
    }]);
    respond(/FROM dbo.PeriodosPlanilla/, [{
      Estado: "EN_REVISION",
      FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
    }]);
    respond(/FROM dbo.PermisosLaborales/, []);
    respond(/FROM dbo.Incapacidades/, []);
    respond(/SET MinutosAjustados = @Minutos/, [{
      AsistenciaId: 1,
      MinutosCalculados: 660,
      MinutosAjustados: 600
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    respond(/FROM dbo.HorasExtras/, [{
      HoraExtraId: 9,
      AsistenciaId: 1,
      MinutosDetectados: minutosDetectados,
      MinutosAjustados: 60
    }]);
    respond(/SET MinutosAjustados = @Minutos/, [{
      AsistenciaId: 1,
      MinutosCalculados: 660,
      MinutosAjustados: 480
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    respond(/MinutosAjustados = CASE WHEN @restablecerAjuste = 1 THEN NULL ELSE MinutosAjustados END/, [{
      HoraExtraId: 9,
      AsistenciaId: 1,
      MinutosDetectados: 120,
      MinutosAjustados: null
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    const result = await asistencias.ajustarMinutosAsistencia(1, 600, "Correccion del total", {
      UsuarioId: 1,
      Rol: "GERENTE"
    });
    expect(result.MinutosEfectivos).toBe(480);
    expect(calls.at(-1).parameters.minutosDetectados.value).toBe(120);
    expect(calls.at(-1).parameters.restablecerAjuste.value).toBe(true);
  });
}
test("ajustar minutos permite cero y confirma la bitacora", async () => {
  respond(/FROM Usuarios/, [{
    RestauranteId: 3
  }]);
  respond(/FROM dbo.AsistenciasDiarias/, [{
    AsistenciaId: 1,
    ColaboradorId: 8,
    FechaAsignada: new Date("2026-10-01"),
    PeriodoId: 2,
    RestauranteId: 3,
    MinutosCalculados: 60,
    MinutosAjustados: null
  }]);
  respond(/FROM dbo.PeriodosPlanilla/, [{
    Estado: "EN_REVISION",
    FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
  }]);
  respond(/FROM dbo.PermisosLaborales/, []);
  respond(/FROM dbo.Incapacidades/, []);
  respond(/SET MinutosAjustados = @Minutos/, [{
    AsistenciaId: 1,
    MinutosCalculados: 60,
    MinutosAjustados: 0
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  respond(/FROM dbo.HorasExtras/, []);
  const commits = sql.Transaction.prototype.commit.mock.calls.length;
  const result = await asistencias.ajustarMinutosAsistencia(1, 0, "Correccion", {
    UsuarioId: 1,
    Rol: "GERENTE"
  });
  expect(result.MinutosAjustados).toBe(0);
  expect(result.MinutosEfectivos).toBe(0);
  expect(sql.Transaction.prototype.commit.mock.calls.length).toBe(commits + 1);
});
test("ajustar minutos revierte si falla la sincronizacion de horas extras", async () => {
  respond(/FROM Usuarios/, [{
    RestauranteId: 3
  }]);
  respond(/FROM dbo.AsistenciasDiarias/, [{
    AsistenciaId: 1,
    ColaboradorId: 8,
    FechaAsignada: new Date("2026-10-01"),
    PeriodoId: 2,
    RestauranteId: 3,
    MinutosCalculados: 600,
    MinutosAjustados: null
  }]);
  respond(/FROM dbo.PeriodosPlanilla/, [{
    Estado: "EN_REVISION",
    FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
  }]);
  respond(/FROM dbo.PermisosLaborales/, []);
  respond(/FROM dbo.Incapacidades/, []);
  respond(/SET MinutosAjustados = @Minutos/, [{
    AsistenciaId: 1,
    MinutosCalculados: 600,
    MinutosAjustados: 0
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  respond(/FROM dbo.HorasExtras/, [{
    HoraExtraId: 9,
    AsistenciaId: 1,
    MinutosDetectados: 120
  }]);
  const error = new Error("Fallo al sincronizar horas extras");
  expected.push({
    pattern: /UPDATE dbo.HorasExtras/,
    error
  });
  const commits = sql.Transaction.prototype.commit.mock.calls.length;
  const rollbacks = sql.Transaction.prototype.rollback.mock.calls.length;
  await assert.rejects(asistencias.ajustarMinutosAsistencia(1, 0, "Correccion", {
    UsuarioId: 1,
    Rol: "GERENTE"
  }), actual => actual === error);
  expect(calls.at(-1).parameters.minutosDetectados.value).toBe(0);
  expect(sql.Transaction.prototype.commit.mock.calls.length).toBe(commits);
  expect(sql.Transaction.prototype.rollback.mock.calls.length).toBe(rollbacks + 1);
});
test("minutos calculados permite cero y usa la transaccion del llamador", async () => {
  respond(/FROM dbo.AsistenciasDiarias/, [{
    AsistenciaId: 1,
    PeriodoId: 2,
    ColaboradorId: 8,
    MinutosCalculados: 60,
    MinutosAjustados: null
  }]);
  respond(/FROM dbo.PeriodosPlanilla/, [{
    Estado: "ABIERTO"
  }]);
  respond(/SET MinutosCalculados = @Minutos/, [{
    AsistenciaId: 1,
    MinutosCalculados: 0,
    MinutosAjustados: null
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  const transaction = new sql.Transaction(pool);
  const commits = sql.Transaction.prototype.commit.mock.calls.length;
  const result = await asistencias.actualizarMinutosCalculados(1, 0, transaction, {
    UsuarioId: 2,
    ColaboradorId: 8
  });
  expect(result.MinutosCalculados).toBe(0);
  expect(sql.Transaction.prototype.commit.mock.calls.length).toBe(commits);
});
test("ajustar minutos revierte ante periodo cerrado o plazo vencido", async () => {
  for (const periodo of [{
    Estado: "PROGRAMADO",
    FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
  }, {
    Estado: "PAGADO",
    FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
  }, {
    Estado: "CERRADO",
    FechaLimiteAjustes: new Date("9999-12-31T00:00:00Z")
  }, {
    Estado: "ABIERTO",
    FechaLimiteAjustes: new Date("2000-12-31T00:00:00Z")
  }]) {
    respond(/FROM Usuarios/, [{
      RestauranteId: 3
    }]);
    respond(/FROM dbo.AsistenciasDiarias/, [{
      AsistenciaId: 1,
      PeriodoId: 2,
      RestauranteId: 3
    }]);
    respond(/FROM dbo.PeriodosPlanilla/, [periodo]);
    const rollbacks = sql.Transaction.prototype.rollback.mock.calls.length;
    await assert.rejects(asistencias.ajustarMinutosAsistencia(1, 60, "Correccion", {
      UsuarioId: 1,
      Rol: "GERENTE"
    }), {
      status: 409
    });
    expect(sql.Transaction.prototype.rollback.mock.calls.length).toBe(rollbacks + 1);
  }
});
for (const Estado of ["ABIERTO", "EN_REVISION"]) {
  for (const vencido of [false, true]) {
    test(`ajustes de asistencia ${Estado}: ${vencido ? "jueves rechaza aunque la tarea no haya cerrado" : "miércoles 23:59:59 permite"}`, async () => {
      jest.useFakeTimers({
        now: new Date(vencido ? "2026-10-29T06:00:00Z" : "2026-10-29T05:59:59Z"),
        doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
      });
      respond(/FROM Usuarios/, [{
        RestauranteId: 3
      }]);
      respond(/FROM dbo.AsistenciasDiarias/, [{
        AsistenciaId: 1,
        ColaboradorId: 8,
        FechaAsignada: new Date("2026-10-25"),
        PeriodoId: 2,
        RestauranteId: 3,
        MinutosCalculados: 60,
        MinutosAjustados: null
      }]);
      respond(/FROM dbo.PeriodosPlanilla/, [{
        Estado,
        FechaLimiteAjustes: new Date("2026-10-28T00:00:00Z")
      }]);
      if (vencido) {
        await assert.rejects(asistencias.ajustarMinutosAsistencia(1, 0, "Corrección", {
          UsuarioId: 1,
          Rol: "GERENTE"
        }), {
          status: 409
        });
      } else {
        respond(/FROM dbo.PermisosLaborales/, []);
        respond(/FROM dbo.Incapacidades/, []);
        respond(/SET MinutosAjustados = @Minutos/, [{
          AsistenciaId: 1,
          MinutosCalculados: 60,
          MinutosAjustados: 0
        }]);
        respond(/INSERT INTO dbo.Bitacora/);
        respond(/FROM dbo.HorasExtras/, []);
        const result = await asistencias.ajustarMinutosAsistencia(1, 0, "Corrección", {
          UsuarioId: 1,
          Rol: "GERENTE"
        });
        expect(result.MinutosEfectivos).toBe(0);
      }
    });
  }
}
test("asistencias valida la fecha con un mensaje identificable", async () => {
  await assert.rejects(asistencias.obtenerAsistenciaPorColaboradorYfecha(1, "incorrecta"), {
    status: 400,
    message: "Fecha asignada debe tener el formato YYYY-MM-DD"
  });
});
test("asistencias usa la semana actual y requiere restaurante para administración", async () => {
  jest.useFakeTimers({
    now: new Date("2026-09-29T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  respond(/FROM dbo.AsistenciasDiarias/, [{
    AsistenciaId: 1
  }]);
  expect(await asistencias.listarAsistenciasPorColaborador(1)).toEqual([{
    AsistenciaId: 1,
    LimiteOrdinarioMinutos: 480
  }]);
  expect(calls[0].parameters.Desde.value.toISOString().slice(0, 10)).toBe("2026-09-28");
  expect(calls[0].parameters.Hasta.value.toISOString().slice(0, 10)).toBe("2026-09-29");
  await assert.rejects(asistencias.listarAsistenciasPorRestaurante({
    UsuarioId: 1,
    Rol: "ADMINISTRADOR"
  }, null, {
    periodoId: 1
  }), {
    status: 400
  });
});
test("asistencias de restaurante rechaza usuario ausente y rol colaborador", async () => {
  for (const [usuario, status] of [[undefined, 401], [null, 401], [{
    UsuarioId: 1,
    Rol: "COLABORADOR"
  }, 403]]) {
    await assert.rejects(asistencias.listarAsistenciasPorRestaurante(usuario, 2, {
      periodoId: 1
    }), {
      status
    });
  }
});
test("asistencias de restaurante permite un listado vacío", async () => {
  respond(/FROM dbo.AsistenciasDiarias AS a/, []);
  expect(await asistencias.listarAsistenciasPorRestaurante({
    UsuarioId: 1,
    Rol: "RECURSOS_HUMANOS"
  }, 2, {
    periodoId: 1
  })).toEqual([]);
});
test("gerente consulta su restaurante sin enviarlo y no puede consultar otro", async () => {
  const usuario = {
    UsuarioId: 1,
    Rol: "GERENTE"
  };
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.AsistenciasDiarias AS a/, [{
    AsistenciaId: 7
  }]);
  expect(await asistencias.listarAsistenciasPorRestaurante(usuario, null, {
    periodoId: 1
  })).toEqual([{
    AsistenciaId: 7,
    LimiteOrdinarioMinutos: 480
  }]);
  expect(calls.at(-1).parameters.RestauranteId.value).toBe(2);
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  await assert.rejects(asistencias.listarAsistenciasPorRestaurante(usuario, 3, {
    periodoId: 1
  }), {
    status: 403
  });
});
function activeReferences() {
  respond(/FROM Restaurantes WHERE RestauranteId = @id/, [{
    RestauranteId: 1,
    Activo: true
  }]);
  respond(/FROM Puestos WHERE PuestoId = @id/, [{
    PuestoId: 2,
    Activo: true
  }]);
}
test("asistencias consulta periodo completo sin fechas nulas y semana dentro del periodo", async () => {
  const usuario = {
    UsuarioId: 1,
    Rol: "ADMINISTRADOR"
  };
  for (const filtros of [{
    periodoId: 12
  }, {
    periodoId: 12,
    desde: "2026-08-24",
    hasta: "2026-08-30"
  }]) {
    respond(/FROM dbo.AsistenciasDiarias AS a/, [{
      AsistenciaId: 7
    }]);
    expect(await asistencias.listarAsistenciasPorRestaurante(usuario, 3, filtros)).toEqual([{
      AsistenciaId: 7,
      LimiteOrdinarioMinutos: 480
    }]);
    expect(calls.at(-1).parameters.PeriodoId.value).toBe(12);
    expect(calls.at(-1).parameters.Desde.value?.toISOString().slice(0, 10) ?? null).toBe(filtros.desde ?? null);
    expect(calls.at(-1).parameters.Hasta.value?.toISOString().slice(0, 10) ?? null).toBe(filtros.hasta ?? null);
  }
  respond(/FROM dbo.AsistenciasDiarias AS a/, [{
    AsistenciaId: 8
  }]);
  expect(await asistencias.listarAsistenciasPorColaborador(8, {
    periodoId: 12
  })).toEqual([{
    AsistenciaId: 8,
    LimiteOrdinarioMinutos: 480
  }]);
});
const colaborador = {
  identificacion: "123456789",
  correo: "persona@example.com",
  nombre: "Ana",
  apellido1: "Mora",
  apellido2: null,
  fechaIngreso: "2026-01-10",
  restauranteId: 1,
  puestoId: 2
};
const password = " clave con espacios ";
const passwordHash = await hash(password, 4);
const user = {
  UsuarioId: 1,
  NombreUsuario: "ana",
  RolId: 1,
  PasswordHash: passwordHash,
  Activo: true
};
test("login usa PasswordHash, conserva los espacios y no expone el hash", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario = @username/, [user]);
  respond(/FROM Roles WHERE RolId/, [{
    Codigo: "ADMINISTRADOR"
  }]);
  const result = await auth.loginUser(" ana ", password);
  expect(result.Rol).toBe("ADMINISTRADOR");
  expect(result.UsuarioId).toBe(1);
  expect("PasswordHash" in result).toBe(false);
  expect(calls[0].parameters.username.value).toBe("ana");
  expect(calls[0].parameters.username.type.type).toBe(sql.NVarChar);
});
test("login rechaza contraseña incorrecta, usuario ausente e inactivo", async () => {
  for (const records of [[user], [], [{
    ...user,
    Activo: false
  }]]) {
    respond(/FROM Usuarios/, records);
    await assert.rejects(auth.loginUser("ana", "incorrecta"), {
      status: 401
    });
  }
});
test("registro vincula un colaborador y almacena un hash comprobable", async () => {
  respond(/FROM Usuarios/, []);
  respond(/FROM Roles/, [{
    RolId: 1
  }]);
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 5,
    Activo: true
  }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, []);
  respond(/INSERT INTO Usuarios/, [{
    UsuarioId: 8
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await auth.registerUser({
    nombreUsuario: " admin ",
    password,
    rolId: "1",
    colaboradorId: "5"
  }, 3)).toBe(8);
  expect(calls[0].parameters.includeInactive.value).toBe(true);
  const values = calls.at(-1).parameters;
  expect(values.ColaboradorId.value).toBe(5);
  expect(values.NombreUsuario.value).toBe("admin");
  assert.notEqual(values.PasswordHash.value, password);
  expect(await compare(password, values.PasswordHash.value)).toBe(true);
});
test("registro detecta nombres reservados por cuentas inactivas", async () => {
  respond(/FROM Usuarios/, [{
    ...user,
    Activo: false
  }]);
  await assert.rejects(auth.registerUser({
    nombreUsuario: "ana",
    password,
    rolId: 1,
    colaboradorId: 5
  }, 3), {
    status: 409
  });
  expect(calls[0].parameters.includeInactive.value).toBe(true);
});
test("registro rechaza un colaborador que ya tiene cuenta", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario/, []);
  respond(/FROM Roles/, [{
    RolId: 1
  }]);
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 5,
    Activo: true
  }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, [{
    UsuarioId: 9,
    Activo: false
  }]);
  await assert.rejects(auth.registerUser({
    nombreUsuario: "ana",
    password,
    rolId: 1,
    colaboradorId: 5
  }, 3), {
    status: 409
  });
});
test("registro valida la contraseña obligatoria y la existencia del rol", async () => {
  await assert.rejects(auth.registerUser({
    nombreUsuario: "ana",
    password: "",
    rolId: 1,
    colaboradorId: 5
  }, 3), {
    status: 400
  });
  respond(/FROM Usuarios/, []);
  respond(/FROM Roles/, []);
  await assert.rejects(auth.registerUser({
    nombreUsuario: "ana",
    password,
    rolId: 999,
    colaboradorId: 5
  }, 3), {
    status: 404
  });
});
test("registro exige un colaborador válido antes de consultar", async () => {
  for (const colaboradorId of [undefined, null, "", 0, "abc"]) {
    await assert.rejects(auth.registerUser({
      nombreUsuario: "ana",
      password,
      rolId: 1,
      colaboradorId
    }, 3), {
      status: 400
    });
  }
  expect(calls.length).toBe(0);
});
test("registro rechaza colaboradores inexistentes o inactivos", async () => {
  for (const [records, status] of [[[], 404], [[{
    ColaboradorId: 5,
    Activo: false
  }], 409]]) {
    respond(/FROM Usuarios WHERE NombreUsuario/, []);
    respond(/FROM Roles/, [{
      RolId: 1
    }]);
    respond(/FROM Colaboradores/, records);
    await assert.rejects(auth.registerUser({
      nombreUsuario: "ana",
      password,
      rolId: 1,
      colaboradorId: 5
    }, 3), {
      status
    });
  }
});
test("consultar un rol solo exige su existencia, sin columna Activo", async () => {
  const rol = {
    RolId: 1,
    Codigo: "ADMIN",
    Nombre: "Administrador"
  };
  respond(/FROM Roles WHERE RolId/, [rol]);
  expect(await roles.getRol(1)).toEqual(rol);
});
test("consultas de usuarios nunca devuelven hashes", async () => {
  respond(/FROM Usuarios$/, [user]);
  respond(/FROM Roles/, [{
    Codigo: "ADMINISTRADOR"
  }]);
  respond(/FROM Usuarios WHERE UsuarioId = @id/, [user]);
  respond(/FROM Roles/, [{
    Codigo: "ADMINISTRADOR"
  }]);
  const list = await auth.getUsers();
  const result = await auth.getUser(1);
  expect(list[0].UsuarioId).toBe(1);
  expect(list[0].Rol).toBe("ADMINISTRADOR");
  expect(result.Rol).toBe("ADMINISTRADOR");
  expect("PasswordHash" in list[0]).toBe(false);
  expect("PasswordHash" in result).toBe(false);
});
test("cambiar contraseña exige la actual y guarda la nueva cifrada", async () => {
  respond(/FROM Usuarios/, [user]);
  await assert.rejects(auth.changePassword(1, "incorrecta", "nueva"), {
    status: 401
  });
  respond(/FROM Usuarios/, [user]);
  respond(/UPDATE Usuarios SET PasswordHash.*AND Activo = 1/);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await auth.changePassword(1, password, " nueva ")).toBe(true);
  expect(await compare(" nueva ", calls.at(-1).parameters.PasswordHash.value)).toBe(true);
});
test("IDs inválidos se rechazan antes de consultar la base", async () => {
  for (const id of [0, -1, 1.5, true, [], {}, "abc", "1.5", " ", Infinity, 2147483648]) {
    for (const read of [auth.getUser, colaboradores.getColaborador, puestos.getPuesto, restaurantes.getRestaurante, roles.getRol, ubicaciones.getDistrito]) {
      await assert.rejects(read(id), {
        status: 400
      });
    }
  }
  expect(calls.length).toBe(0);
});
test("activar y desactivar exigen IDs y actores válidos antes de consultar", async () => {
  for (const action of [colaboradores.activarColaborador, colaboradores.desactivarColaborador, puestos.activarPuesto, puestos.desactivarPuesto, restaurantes.activarRestaurante, restaurantes.desactivarRestaurante]) {
    await assert.rejects(action("abc", 3), {
      status: 400
    });
    for (const actor of ["false", "true", 0, -1, null, undefined]) {
      await assert.rejects(action(1, actor), {
        status: 400
      });
    }
  }
  expect(calls.length).toBe(0);
});
test("crear colaborador incluye correo, tipos correctos y opcionales nulos", async () => {
  sql.Transaction.prototype.begin.mockClear();
  sql.Transaction.prototype.commit.mockClear();
  sql.Transaction.prototype.rollback.mockClear();
  sql.Transaction.prototype.request.mockClear();
  activeReferences();
  respond(/INSERT INTO Colaboradores \(Identificacion, Correo,/, [{
    ColaboradorId: 12
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  esperarSaldoInicial(respond);
  expect(await colaboradores.createNewColaborador(colaborador, 3)).toBe(12);
  expect(sql.Transaction.prototype.begin).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.commit).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.rollback).not.toHaveBeenCalled();
  const transacciones = sql.Transaction.prototype.request.mock.contexts;
  expect(transacciones.length).toBe(6);
  expect(transacciones.every((transaction) => transaction === transacciones[0])).toBe(true);
  const parameters = calls.find(c => c.query.includes("INSERT INTO Colaboradores")).parameters;
  expect(parameters.Correo.value).toBe(colaborador.correo);
  expect(parameters.Correo.type.length).toBe(100);
  expect(parameters.Identificacion.type.length).toBe(30);
  expect(parameters.Nombres.type.length).toBe(100);
  expect(parameters.Apellido1.type.length).toBe(100);
  expect(parameters.Apellido1.value).toBe(colaborador.apellido1);
  expect(parameters.Apellido2.type.length).toBe(100);
  expect(parameters.Apellido2.value).toBeNull();
  expect(parameters.FechaIngreso.type).toBe(sql.Date);
  expect(parameters.FechaIngreso.value.toISOString()).toBe("2026-01-10T00:00:00.000Z");
  expect(parameters.FechaSalida.value).toBe(null);
  expect(parameters.DistritoId.value).toBe(null);
  expect(parameters.DetalleDireccion.value).toBe(null);
});
test("crear colaborador revierte toda la transacción si falla el saldo inicial", async () => {
  sql.Transaction.prototype.begin.mockClear();
  sql.Transaction.prototype.commit.mockClear();
  sql.Transaction.prototype.rollback.mockClear();
  activeReferences();
  respond(/INSERT INTO Colaboradores \(Identificacion, Correo,/, [{ ColaboradorId: 12 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  respond(/FROM Colaboradores/, [{ ColaboradorId: 12, FechaIngreso: new Date("2026-01-10T00:00:00Z") }]);
  respond(/FROM dbo.SaldosVacaciones/, []);
  const error = new Error("Error al crear saldo");
  expected.push({ pattern: /INSERT INTO dbo.SaldosVacaciones/, error });

  await expect(colaboradores.createNewColaborador(colaborador, 3)).rejects.toBe(error);
  expect(sql.Transaction.prototype.begin).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.commit).not.toHaveBeenCalled();
  expect(sql.Transaction.prototype.rollback).toHaveBeenCalledTimes(1);
});

test("inicializar saldo independiente confirma su propia transacción", async () => {
  sql.Transaction.prototype.begin.mockClear();
  sql.Transaction.prototype.commit.mockClear();
  sql.Transaction.prototype.rollback.mockClear();
  esperarSaldoInicial(respond);

  const saldo = await saldosVacaciones.inicializarSaldoVacaciones(12, 3);
  expect(saldo.ColaboradorId).toBe(12);
  expect(sql.Transaction.prototype.begin).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.commit).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.rollback).not.toHaveBeenCalled();
});

test("inicializar saldo independiente revierte su transacción si falla", async () => {
  sql.Transaction.prototype.begin.mockClear();
  sql.Transaction.prototype.commit.mockClear();
  sql.Transaction.prototype.rollback.mockClear();
  respond(/FROM Colaboradores/, [{ ColaboradorId: 12, FechaIngreso: new Date("2026-01-10T00:00:00Z") }]);
  respond(/FROM dbo.SaldosVacaciones/, []);
  const error = new Error("Error al crear saldo");
  expected.push({ pattern: /INSERT INTO dbo.SaldosVacaciones/, error });

  await expect(saldosVacaciones.inicializarSaldoVacaciones(12, 3)).rejects.toBe(error);
  expect(sql.Transaction.prototype.begin).toHaveBeenCalledTimes(1);
  expect(sql.Transaction.prototype.commit).not.toHaveBeenCalled();
  expect(sql.Transaction.prototype.rollback).toHaveBeenCalledTimes(1);
});
test("editar colaborador también actualiza el correo", async () => {
  activeReferences();
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 12,
    Activo: true
  }]);
  respond(/UPDATE Colaboradores[\s\S]*Correo = @Correo/);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await colaboradores.updateExistingColaborador("12", colaborador, 3)).toBe(true);
  expect(calls.at(-1).parameters.id.value).toBe(12);
});

test.each([
  ["Mora", null, "Mora", null],
  ["Mora", "Pérez", "Mora", "Pérez"],
  ["de la Cruz", "Del Valle", "de la Cruz", "Del Valle"],
  ["Mora", undefined, "Mora", null],
  ["Mora", "", "Mora", null],
  ["  de la Cruz  ", "   ", "de la Cruz", null],
  ["Mora", "  Del Valle  ", "Mora", "Del Valle"],
  ["a".repeat(100), "b".repeat(100), "a".repeat(100), "b".repeat(100)],
])("crear colaborador conserva y normaliza sus apellidos: %#", async (apellido1, apellido2, esperado1, esperado2) => {
  activeReferences();
  respond(/INSERT INTO Colaboradores/, [{ ColaboradorId: 12 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  esperarSaldoInicial(respond);
  await colaboradores.createNewColaborador({ ...colaborador, apellido1, apellido2 }, 3);
  const { query, parameters } = calls.find((c) => c.query.includes("INSERT INTO Colaboradores"));
  expect(query).toContain("Nombres, Apellido1, Apellido2");
  expect(parameters.Apellido1.value).toBe(esperado1);
  expect(parameters.Apellido2.value).toBe(esperado2);
  expect(parameters.Apellido1.type.length).toBe(100);
  expect(parameters.Apellido2.type.length).toBe(100);
});

test.each([
  ["Mora", "Pérez", "Pérez"],
  ["de la Cruz", null, null],
  ["de la Cruz", "", null],
  ["de la Cruz", "   ", null],
  ["de la Cruz", undefined, null],
])("editar colaborador guarda ambos campos y permite quitar el segundo: %#", async (apellido1, apellido2, esperado2) => {
  activeReferences();
  respond(/FROM Colaboradores/, [{ ColaboradorId: 12, Apellido1: "Mora", Apellido2: "Pérez", Activo: true }]);
  respond(/UPDATE Colaboradores/);
  respond(/INSERT INTO dbo.Bitacora/);
  await colaboradores.updateExistingColaborador(12, { ...colaborador, apellido1, apellido2 }, 3);
  const { query, parameters } = calls.find((c) => c.query.includes("UPDATE Colaboradores"));
  expect(query).toContain("Apellido1 = @Apellido1");
  expect(query).toContain("Apellido2 = @Apellido2");
  expect(parameters.Apellido1.value).toBe(apellido1);
  expect(parameters.Apellido2.value).toBe(esperado2);
});

test.each([
  { apellido1: undefined }, { apellido1: null }, { apellido1: "" }, { apellido1: "   " },
  { apellido1: "a".repeat(101) }, { apellido2: "a".repeat(101) },
  { apellido2: false }, { apellido2: 123 }, { apellido2: {} },
])("apellidos inválidos se rechazan antes de consultar o guardar: %#", async (cambios) => {
  await assert.rejects(colaboradores.createNewColaborador({ ...colaborador, ...cambios }, 3), { status: 400 });
  await assert.rejects(colaboradores.updateExistingColaborador(12, { ...colaborador, ...cambios }, 3), { status: 400 });
  expect(calls).toEqual([]);
});
test("colaboradores rechazan correo inválido, fechas imposibles e intervalos invertidos", async () => {
  for (const changes of [{
    correo: undefined
  }, {
    correo: "sin-arroba"
  }, {
    fechaIngreso: "2026-02-30"
  }, {
    fechaIngreso: "2026-13-01"
  }, {
    fechaIngreso: "0000-01-01"
  }, {
    fechaSalida: "2026-01-09"
  }, {
    distritoId: "abc"
  }, {
    nombre: "a".repeat(101)
  }]) {
    await assert.rejects(colaboradores.createNewColaborador({
      ...colaborador,
      ...changes
    }, 3), {
      status: 400
    });
  }
  expect(calls.length).toBe(0);
});
test("no se asignan colaboradores a restaurantes o puestos inactivos", async () => {
  respond(/FROM Restaurantes/, [{
    Activo: false
  }]);
  await assert.rejects(colaboradores.createNewColaborador(colaborador, 3), {
    status: 409
  });
  respond(/FROM Restaurantes/, [{
    Activo: true
  }]);
  respond(/FROM Puestos/, [{
    Activo: false
  }]);
  await assert.rejects(colaboradores.createNewColaborador(colaborador, 3), {
    status: 409
  });
});
test("crear puesto respeta NVARCHAR(80), DECIMAL(12,2) y la tarifa opcional", async () => {
  respond(/INSERT INTO Puestos/, [{
    PuestoId: 7
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await puestos.createNewPuesto({
    nombre: "a".repeat(80),
    tarifaHora: "9999999999.99"
  }, 3)).toBe(true);
  expect(calls[0].parameters.Nombre.type.length).toBe(80);
  expect(calls[0].parameters.TarifaHora.type.precision).toBe(12);
  expect(calls[0].parameters.TarifaHora.type.scale).toBe(2);
  respond(/INSERT INTO Puestos/, [{
    PuestoId: 8
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  await puestos.createNewPuesto({
    nombre: "Cajero"
  }, 3);
  expect(calls[1].parameters.TarifaHora.value).toBe(null);
});
test("puestos rechazan tarifas negativas, excesivas o con más de dos decimales", async () => {
  for (const tarifaHora of [0, -1, 1.234, "10000000000", "abc", true, Infinity]) {
    await assert.rejects(puestos.createNewPuesto({
      nombre: "Cajero",
      tarifaHora
    }, 3), {
      status: 400
    });
  }
});
test("la tarifa de un puesto activo puede actualizarse o dejarse pendiente", async () => {
  for (const tarifa of [1500.25, null]) {
    respond(/FROM Puestos/, [{
      PuestoId: 1,
      Activo: true
    }]);
    respond(/UPDATE Puestos SET TarifaHora.*AND Activo = 1/);
    respond(/INSERT INTO dbo.Bitacora/);
    expect(await puestos.updateTarifaPuesto(1, tarifa, 3)).toBe(true);
    expect(calls.at(-1).parameters.TarifaHora.value).toBe(tarifa);
  }
});
test("restaurantes admiten dirección ausente o completa de hasta 300 caracteres", async () => {
  respond(/INSERT INTO Restaurantes/, [{
    RestauranteId: 7
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await restaurantes.createNewRestaurante({
    nombre: "Centro"
  }, 3)).toBe(true);
  expect(calls[0].parameters.distritoId.value).toBe(null);
  respond(/INSERT INTO Restaurantes/, [{
    RestauranteId: 8
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  await restaurantes.createNewRestaurante({
    nombre: "Norte",
    distritoId: 10101,
    detalleDireccion: "a".repeat(300)
  }, 3);
  expect(calls.at(-1).parameters.detalleDireccion.type.length).toBe(300);
});
test("restaurantes rechazan direcciones incompletas y propagan errores de integridad", async () => {
  for (const direccion of [{
    distritoId: 10101
  }, {
    detalleDireccion: "Centro"
  }]) {
    await assert.rejects(restaurantes.createNewRestaurante({
      nombre: "Centro",
      ...direccion
    }, 3), {
      status: 400
    });
  }
  const error = Object.assign(new Error("Distrito inexistente"), {
    number: 547
  });
  expected.push({
    pattern: /INSERT INTO Restaurantes/,
    error
  });
  await assert.rejects(restaurantes.createNewRestaurante({
    nombre: "Centro",
    distritoId: 99999,
    detalleDireccion: "Calle 1"
  }, 3), received => received === error);
});
test("se puede editar un restaurante activo y reactivar uno inactivo", async () => {
  respond(/FROM Restaurantes/, [{
    RestauranteId: 1,
    Activo: true
  }]);
  respond(/UPDATE Restaurantes SET Nombre/);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await restaurantes.updateExistingRestaurante(1, {
    nombre: "Centro"
  }, 3)).toBe(true);
  respond(/FROM Restaurantes/, [{
    RestauranteId: 1,
    Activo: false
  }]);
  respond(/UPDATE Restaurantes SET Activo = @activo WHERE RestauranteId = @id/);
  respond(/INSERT INTO dbo.Bitacora/);
  expect(await restaurantes.activarRestaurante(1, 3)).toBe(true);
  expect(calls.at(-1).parameters.activo.value).toBe(true);
});
test("consultas individuales permiten recuperar puestos y restaurantes inactivos", async () => {
  respond(/FROM Puestos WHERE PuestoId = @id$/, [{
    PuestoId: 1,
    Activo: false
  }]);
  respond(/FROM Restaurantes WHERE RestauranteId = @id$/, [{
    RestauranteId: 1,
    Activo: false
  }]);
  expect((await puestos.getPuesto(1)).Activo).toBe(false);
  expect((await restaurantes.getRestaurante(1)).Activo).toBe(false);
});
test("catálogos territoriales filtran por el ID del padre", async () => {
  respond(/FROM Provincias WHERE ProvinciaId/, [{
    ProvinciaId: 1
  }]);
  respond(/FROM Cantones WHERE ProvinciaId = @idProvincia/, [{
    CantonId: 101
  }]);
  expect(await ubicaciones.getCantones("1")).toEqual([{
    CantonId: 101
  }]);
  expect(calls.at(-1).parameters.idProvincia.value).toBe(1);
  respond(/FROM Cantones WHERE CantonId/, [{
    CantonId: 101
  }]);
  respond(/FROM Distritos WHERE CantonId = @idCanton/, [{
    DistritoId: 10101
  }]);
  expect(await ubicaciones.getDistritos(101)).toEqual([{
    DistritoId: 10101
  }]);
  expect(calls.at(-1).parameters.idCanton.value).toBe(101);
});
test("catálogos distinguen padres inexistentes de listas vacías", async () => {
  respond(/FROM Provincias WHERE ProvinciaId/, []);
  await assert.rejects(ubicaciones.getCantones(99), {
    status: 404
  });
  respond(/FROM Cantones WHERE CantonId/, []);
  await assert.rejects(ubicaciones.getDistritos(999), {
    status: 404
  });
  respond(/FROM Roles WHERE RolId/, []);
  await assert.rejects(roles.getRol(99), {
    status: 404
  });
});
test("listas vacías de los catálogos y colaboradores devuelven arreglos", async () => {
  for (const [list, table] of [[roles.getRoles, "Roles"], [ubicaciones.getProvincias, "Provincias"], [puestos.getPuestos, "Puestos"], [restaurantes.getRestaurantes, "Restaurantes"], [() => colaboradores.getColaboradores({
    UsuarioId: 3,
    Rol: "ADMINISTRADOR"
  }), "Colaboradores"]]) {
    respond(new RegExp(`FROM ${table}`), undefined);
    expect(await list()).toEqual([]);
  }
});
test("activar o desactivar un registro inexistente produce 404", async () => {
  for (const [action, table] of [[puestos.activarPuesto, "Puestos"], [puestos.desactivarPuesto, "Puestos"], [restaurantes.activarRestaurante, "Restaurantes"], [restaurantes.desactivarRestaurante, "Restaurantes"], [colaboradores.activarColaborador, "Colaboradores"], [colaboradores.desactivarColaborador, "Colaboradores"]]) {
    respond(new RegExp(`FROM ${table}`), []);
    await assert.rejects(action(999, 3), {
      status: 404
    });
  }
});
test("errores SQL de escritura se propagan sin capturarlos ni transformarlos", async () => {
  for (const number of [2601, 2627, 547]) {
    const error = Object.assign(new Error("SQL"), {
      number
    });
    expected.push({
      pattern: /INSERT INTO Puestos/,
      error
    });
    await assert.rejects(puestos.createNewPuesto({
      nombre: "Cajero"
    }, 3), received => received === error);
  }
});
test("registerUser propaga el error original si falla la creación", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario/, []);
  respond(/FROM Roles/, [{
    RolId: 1
  }]);
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 5,
    Activo: true
  }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, []);
  const error = Object.assign(new Error("Nombre duplicado por una escritura concurrente"), {
    number: 2627
  });
  expected.push({
    pattern: /INSERT INTO Usuarios/,
    error
  });
  await assert.rejects(auth.registerUser({
    nombreUsuario: "ana",
    password,
    rolId: 1,
    colaboradorId: 5
  }, 3), received => received === error);
});
test("los servicios propagan errores de lectura sin transformarlos", async () => {
  for (const [read, table] of [[roles.getRol, "Roles"], [ubicaciones.getDistrito, "Distritos"], [auth.getUser, "Usuarios"]]) {
    const error = new Error("Conexión interrumpida");
    expected.push({
      pattern: new RegExp(`FROM ${table}`),
      error
    });
    await assert.rejects(read(1), received => received === error);
  }
});
test("mis marcas admite desde y usa solo hasta como consulta de ese dia", async () => {
  const usuario = {
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  };
  for (const filtros of [{
    desde: "2026-09-21"
  }, {
    hasta: "2026-09-25"
  }, {
    desde: "2026-09-25",
    hasta: "2026-09-25"
  }]) {
    respond(/FROM dbo.MarcasAsistencia/, []);
    expect(await marcas.consultarMisMarcas(usuario, filtros)).toEqual([]);
    for (const campo of ["desde", "hasta"]) {
      const esperado = campo === "desde" ? filtros.desde ?? filtros.hasta : filtros.hasta;
      expect(calls.at(-1).parameters[campo].value?.toISOString().slice(0, 10) ?? null).toBe(esperado ?? null);
    }
  }
});
test("mis marcas rechaza rangos invertidos y fechas invalidas antes de consultar", async () => {
  const usuario = {
    UsuarioId: 1,
    ColaboradorId: 8,
    Rol: "COLABORADOR"
  };
  for (const filtros of [{
    desde: "2026-09-25",
    hasta: "2026-09-21"
  }, {
    hasta: "2026-02-30"
  }, {
    desde: "incorrecta"
  }]) {
    await assert.rejects(marcas.consultarMisMarcas(usuario, filtros), {
      status: 400
    });
  }
  expect(calls.length).toBe(0);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
