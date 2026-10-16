import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as siguienteTurno } from "node:timers/promises";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const periodosService = await import("../src/modules/periodoPlanilla/periodosPlanillas.service.js");
const { obtenerCalendarioActual } = await import("../src/shared/utils/fechaUtils.js");
const { filtrarPeriodos, estadoLabels } = await import("../../client/src/utils/periodosUtils.js");
const { obtenerFechaHoyCostaRica } = await import("../../client/src/utils/fechaUtils.js");

const periodoBase = {
  PeriodoId: 1, Estado: "PROGRAMADO",
  FechaInicio: new Date("2026-10-12T00:00:00Z"),
  FechaFin: new Date("2026-10-25T00:00:00Z"),
  FechaLimiteAjustes: new Date("2026-10-28T00:00:00Z"),
  FechaPago: new Date("2026-10-30T00:00:00Z"),
};

for (const [instante, esperado] of [
  ["2026-10-12T09:59:59Z", "PROGRAMADO"],
  ["2026-10-12T10:00:00Z", "ABIERTO"],
  ["2026-10-26T09:59:59Z", "ABIERTO"],
  ["2026-10-26T10:00:00Z", "EN_REVISION"],
  ["2026-10-29T05:59:59Z", "EN_REVISION"],
  ["2026-10-29T06:00:00Z", "CERRADO"],
  ["2026-10-30T06:00:00Z", "CERRADO"],
]) {
  test(`calendario CR: ${instante} corresponde a ${esperado}`, () => {
    assert.equal(periodosService.determinarEstadoPeriodo(periodoBase, obtenerCalendarioActual(new Date(instante))), esperado);
  });
}

// Simula los resultados SQL y registra las operaciones, sin conectarse a una BD.
function prepararBD(t, periodos, { sinActualizacion = false, fallaBitacora = false } = {}) {
  const eventos = [];
  const auditorias = [];
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(sql.Transaction.prototype, "begin", async () => { eventos.push("begin"); });
  t.mock.method(sql.Transaction.prototype, "commit", async () => { eventos.push("commit"); });
  t.mock.method(sql.Transaction.prototype, "rollback", async () => { eventos.push("rollback"); });
  const request = () => ({
    parametros: {},
    input(nombre, _tipo, valor) { this.parametros[nombre] = valor; return this; },
    async query(query) {
      const p = this.parametros;
      if (query.includes("UPDATE dbo.PeriodosPlanilla")) {
        assert.match(query, /AND Estado = @EstadoActual/);
        const indice = periodos.findIndex((periodo) => periodo.PeriodoId === p.PeriodoId && periodo.Estado === p.EstadoActual);
        if (sinActualizacion || indice === -1) return { recordset: [] };
        periodos[indice] = { ...periodos[indice], Estado: p.NuevoEstado };
        eventos.push("update");
        return { recordset: [periodos[indice]] };
      }
      if (query.includes("INSERT INTO dbo.Bitacora")) {
        eventos.push("audit");
        if (fallaBitacora) throw new Error("Fallo de bitácora");
        auditorias.push(p);
        return { rowsAffected: [1] };
      }
      assert.match(query, /FROM dbo.PeriodosPlanilla/);
      return { recordset: p.PeriodoId ? periodos.filter((periodo) => periodo.PeriodoId === p.PeriodoId) : [...periodos] };
    },
  });
  t.mock.method(pool, "request", request);
  t.mock.method(sql.Transaction.prototype, "request", request);
  return { eventos, auditorias };
}

test("recupera períodos atrasados, conserva cerrados/pagados y repetir no duplica bitácoras", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T18:00:00Z") });
  const periodos = [
    { ...periodoBase },
    { ...periodoBase, PeriodoId: 2, Estado: "PAGADO" },
    { ...periodoBase, PeriodoId: 3, Estado: "CERRADO" },
    { ...periodoBase, PeriodoId: 4, FechaInicio: new Date("2026-11-09"), FechaFin: new Date("2026-11-22") },
    { ...periodoBase, PeriodoId: 5, FechaInicio: new Date("2026-10-26"), FechaFin: new Date("2026-11-08") },
  ];
  const { auditorias } = prepararBD(t, periodos);
  assert.equal(await periodosService.actualizarEstadosPeriodos(7), 2);
  assert.deepEqual(periodos.map((periodo) => periodo.Estado), ["CERRADO", "PAGADO", "CERRADO", "PROGRAMADO", "ABIERTO"]);
  assert.equal(await periodosService.actualizarEstadosPeriodos(7), 0);
  assert.equal(auditorias.length, 2);
  assert.deepEqual(JSON.parse(auditorias[0].DatosNuevos), { estado: "CERRADO", origen: "AUTOMATICO" });
  // Ni siquiera un reloj atrasado debe reabrir estados terminales.
  for (const Estado of ["CERRADO", "PAGADO"]) {
    assert.equal(periodosService.determinarEstadoPeriodo({ ...periodoBase, Estado }, { fechaAsignada: "2026-10-01", fechaHoy: "2026-10-01" }), Estado);
  }
});

test("consultar períodos no ejecuta la tarea ni abre transacciones", async (t) => {
  const { eventos, auditorias } = prepararBD(t, [{ ...periodoBase }]);
  await periodosService.listarPeriodos();
  await periodosService.obtenerPeriodo(1);
  await periodosService.obtenerPeriodoPorFecha("2026-10-12");
  await periodosService.obtenerPeriodoActual();
  assert.deepEqual(eventos, []);
  assert.deepEqual(auditorias, []);
});

for (const sinActualizacion of [true, false]) {
  test(`tarea ${sinActualizacion ? "omite el cambio concurrente sin auditar" : "revierte si falla la bitácora"}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T18:00:00Z") });
    const { eventos, auditorias } = prepararBD(t, [{ ...periodoBase }], { sinActualizacion, fallaBitacora: !sinActualizacion });
    if (sinActualizacion) assert.equal(await periodosService.actualizarEstadosPeriodos(7), 0);
    else await assert.rejects(periodosService.actualizarEstadosPeriodos(7), /Fallo de bitácora/);
    assert.equal(eventos.at(-1), sinActualizacion ? "commit" : "rollback");
    assert.equal(auditorias.length, 0);
  });
}

for (const [instante, permitido] of [
  ["2026-10-30T05:59:59Z", false],
  ["2026-10-30T06:00:00Z", true],
  ["2026-11-01T18:00:00Z", true],
]) {
  test(`pago manual según fechaHoy: ${instante}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(instante) });
    const periodos = [{ ...periodoBase, Estado: "CERRADO" }, { ...periodoBase, PeriodoId: 2, Estado: "ABIERTO" }];
    const { auditorias, eventos } = prepararBD(t, periodos);
    if (permitido) {
      const resultado = await periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7);
      assert.equal(resultado.Estado, "PAGADO");
      assert.equal(auditorias.length, 1);
      assert.equal(eventos.at(-1), "commit");
    } else {
      await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), { status: 409 });
      assert.equal(auditorias.length, 0);
      assert.equal(eventos.at(-1), "rollback");
    }
    assert.equal(periodos[1].Estado, "ABIERTO");
  });
}

test("rechaza cambios manuales automáticos, pagos repetidos y pago de períodos no cerrados", async (t) => {
  const periodos = [{ ...periodoBase }];
  const { auditorias } = prepararBD(t, periodos);
  for (const destino of ["PROGRAMADO", "ABIERTO", "EN_REVISION", "CERRADO"]) {
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, destino, 7), { status: 409 });
  }
  for (const Estado of ["PROGRAMADO", "ABIERTO", "EN_REVISION", "PAGADO"]) {
    periodos[0].Estado = Estado;
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), { status: 409 });
  }
  assert.equal(auditorias.length, 0);
});

for (const sinActualizacion of [true, false]) {
  test(`pago ${sinActualizacion ? "detecta actualización concurrente" : "revierte ante fallo de bitácora"}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T18:00:00Z") });
    const { eventos } = prepararBD(t, [{ ...periodoBase, Estado: "CERRADO" }], { sinActualizacion, fallaBitacora: !sinActualizacion });
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), sinActualizacion ? { status: 409 } : /Fallo de bitácora/);
    assert.equal(eventos.at(-1), "rollback");
    assert.equal(eventos.includes("commit"), false);
  });
}

test("filtros de períodos encuentran intersecciones inclusivas y combinan estado, año y búsqueda", () => {
  const periodos = [
    { PeriodoId: 1, Estado: "CERRADO", FechaInicio: "2026-10-12", FechaFin: "2026-10-25" },
    { PeriodoId: 2, Estado: "ABIERTO", FechaInicio: "2026-10-26", FechaFin: "2026-11-08" },
    { PeriodoId: 3, Estado: "EN_REVISION", FechaInicio: "2025-12-29", FechaFin: "2026-01-11" },
    { PeriodoId: 4, Estado: "PAGADO", FechaInicio: "2026-09-28", FechaFin: "2026-10-11" },
  ].map((periodo) => ({ ...periodo, FechaLimiteAjustes: "2026-10-28", FechaPago: "2026-10-30" }));
  const original = structuredClone(periodos);
  const ids = (filtros) => filtrarPeriodos(periodos, filtros).map((p) => p.PeriodoId);
  assert.deepEqual(ids({ desde: "2026-10-20", hasta: "2026-10-21" }), [1]);
  assert.deepEqual(ids({ desde: "2026-10-25", hasta: "2026-10-26" }), [1, 2]);
  assert.deepEqual(ids({ desde: "2026-10-11", hasta: "2026-10-12" }), [1, 4]);
  assert.deepEqual(ids({ desde: "2026-01-01", hasta: "2026-01-02" }), [3]);
  assert.deepEqual(ids({ desde: "2026-10-26" }), [2]);
  assert.deepEqual(ids({ hasta: "2026-10-11" }), [3, 4]);
  assert.deepEqual(ids({ desde: "2026-10-01", estado: "CERRADO", anio: "2026", busqueda: "cerrado" }), [1]);
  assert.deepEqual(ids({ anio: "2025", busqueda: "revision" }), [3]);
  assert.deepEqual(ids({ estado: "PAGADO" }), [4]);
  assert.deepEqual(ids({ desde: "2027-01-01" }), []);
  assert.deepEqual(ids({}), [1, 2, 3, 4]);
  assert.deepEqual(filtrarPeriodos([], {}), []);
  assert.deepEqual(periodos, original);
  assert.equal(estadoLabels.PROGRAMADO, "Programado");
  assert.equal(obtenerFechaHoyCostaRica(new Date("2026-10-30T05:59:59Z")), "2026-10-29");
  assert.equal(obtenerFechaHoyCostaRica(new Date("2026-10-30T06:00:00Z")), "2026-10-30");
});

test("tarea comparte inicio, crea un solo temporizador y omite ticks mientras está ejecutándose", async (t) => {
  const { eventos } = prepararBD(t, []);
  let callback;
  const temporizador = {};
  const interval = t.mock.method(globalThis, "setInterval", (fn, ms) => {
    assert.equal(ms, 60_000);
    callback = fn;
    return temporizador;
  });
  const { iniciarTareaPeriodos } = await import("../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=unica");
  const inicio = iniciarTareaPeriodos(7);
  assert.equal(iniciarTareaPeriodos(7), inicio);
  assert.equal(await inicio, temporizador);
  assert.equal(await iniciarTareaPeriodos(7), temporizador);
  assert.equal(interval.mock.callCount(), 1);
  assert.deepEqual(eventos, ["begin", "commit"]);

  let terminar;
  t.mock.method(sql.Transaction.prototype, "commit", () => new Promise((resolve) => { terminar = resolve; }));
  callback();
  await siguienteTurno();
  callback();
  await siguienteTurno();
  assert.equal(eventos.filter((evento) => evento === "begin").length, 2);
  terminar();
  await siguienteTurno();
  callback();
  await siguienteTurno();
  assert.equal(eventos.filter((evento) => evento === "begin").length, 3);
  terminar();
  await siguienteTurno();
});

test("tarea permite reintentar si la actualización inicial falla", async (t) => {
  prepararBD(t, []);
  const { iniciarTareaPeriodos } = await import("../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=fallo");
  const interval = t.mock.method(globalThis, "setInterval", () => ({}));
  await assert.rejects(iniciarTareaPeriodos(undefined), { status: 400 });
  assert.equal(interval.mock.callCount(), 0);
  await iniciarTareaPeriodos(7);
  assert.equal(interval.mock.callCount(), 1);
});

test("crear período inserta PROGRAMADO explícitamente y registra el estado en bitácora", async (t) => {
  const { eventos, auditorias } = prepararBD(t, []);
  const requestOriginal = sql.Transaction.prototype.request;
  t.mock.method(sql.Transaction.prototype, "request", function () {
    const request = requestOriginal.call(this);
    const queryOriginal = request.query;
    request.query = async function (query) {
      if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return { recordset: [] };
      if (query.includes("INSERT INTO dbo.PeriodosPlanilla")) {
        assert.match(query, /CreadoPorUsuarioId,\s*Estado/);
        assert.match(query, /'PROGRAMADO'/);
        return { recordset: [{ ...periodoBase }] };
      }
      return queryOriginal.call(this, query);
    };
    return request;
  });
  const creado = await periodosService.crearPeriodo({
    fechaInicio: "2026-10-12", fechaFin: "2026-10-25",
    fechaLimiteAjustes: "2026-10-28", fechaPago: "2026-10-30",
  }, 7);
  assert.equal(creado.Estado, "PROGRAMADO");
  assert.equal(JSON.parse(auditorias[0].DatosNuevos).Estado, "PROGRAMADO");
  assert.equal(eventos.at(-1), "commit");
});

test("un fallo periódico no bloquea las siguientes ejecuciones", async (t) => {
  prepararBD(t, []);
  let callback;
  t.mock.method(globalThis, "setInterval", (fn) => { callback = fn; return {}; });
  const errores = t.mock.method(console, "error", () => {});
  const { iniciarTareaPeriodos } = await import("../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=recuperacion");
  await iniciarTareaPeriodos(7);
  let llamadas = 0;
  t.mock.method(sql.Transaction.prototype, "begin", async () => {
    llamadas++;
    if (llamadas === 1) throw new Error("SQL no disponible");
  });
  callback();
  await siguienteTurno();
  assert.equal(errores.mock.callCount(), 1);
  callback();
  await siguienteTurno();
  assert.equal(llamadas, 2);
  assert.equal(errores.mock.callCount(), 1);
});
