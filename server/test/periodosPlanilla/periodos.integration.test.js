import { clonar } from "../support/clonar.js";
import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
import { setImmediate as siguienteTurno } from "node:timers/promises";
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
const periodosService = await import("../../src/modules/periodoPlanilla/periodosPlanillas.service.js");
const {
  obtenerCalendarioActual
} = await import("../../src/shared/utils/fechaUtils.js");
const {
  filtrarPeriodos,
  estadoLabels
} = await import("../../../client/src/utils/periodosUtils.js");
const {
  obtenerFechaHoyCostaRica
} = await import("../../../client/src/utils/fechaUtils.js");
const periodoBase = {
  PeriodoId: 1,
  Estado: "PROGRAMADO",
  FechaInicio: new Date("2026-10-12T00:00:00Z"),
  FechaFin: new Date("2026-10-25T00:00:00Z"),
  FechaLimiteAjustes: new Date("2026-10-28T00:00:00Z"),
  FechaPago: new Date("2026-10-30T00:00:00Z")
};
for (const [instante, esperado] of [["2026-10-12T09:59:59Z", "PROGRAMADO"], ["2026-10-12T10:00:00Z", "ABIERTO"], ["2026-10-26T09:59:59Z", "ABIERTO"], ["2026-10-26T10:00:00Z", "EN_REVISION"], ["2026-10-29T05:59:59Z", "EN_REVISION"], ["2026-10-29T06:00:00Z", "CERRADO"], ["2026-10-30T06:00:00Z", "CERRADO"]]) {
  test(`calendario CR: ${instante} corresponde a ${esperado}`, () => {
    expect(periodosService.determinarEstadoPeriodo(periodoBase, obtenerCalendarioActual(new Date(instante)))).toBe(esperado);
  });
}

// Simula los resultados SQL y registra las operaciones, sin conectarse a una BD.
function prepararBD(periodos, {
  sinActualizacion = false,
  fallaBitacora = false
} = {}) {
  const eventos = [];
  const auditorias = [];
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {
    eventos.push("begin");
  });
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {
    eventos.push("commit");
  });
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {
    eventos.push("rollback");
  });
  const request = () => ({
    parametros: {},
    input(nombre, _tipo, valor) {
      this.parametros[nombre] = valor;
      return this;
    },
    async query(query) {
      const p = this.parametros;
      if (query.includes("UPDATE dbo.PeriodosPlanilla")) {
        expect(query).toMatch(/AND Estado = @EstadoActual/);
        const indice = periodos.findIndex(periodo => periodo.PeriodoId === p.PeriodoId && periodo.Estado === p.EstadoActual);
        if (sinActualizacion || indice === -1) return {
          recordset: []
        };
        periodos[indice] = {
          ...periodos[indice],
          Estado: p.NuevoEstado
        };
        eventos.push("update");
        return {
          recordset: [periodos[indice]]
        };
      }
      if (query.includes("INSERT INTO dbo.Bitacora")) {
        eventos.push("audit");
        if (fallaBitacora) throw new Error("Fallo de bitácora");
        auditorias.push(p);
        return {
          rowsAffected: [1]
        };
      }
      expect(query).toMatch(/FROM dbo.PeriodosPlanilla/);
      return {
        recordset: p.PeriodoId ? periodos.filter(periodo => periodo.PeriodoId === p.PeriodoId) : [...periodos]
      };
    }
  });
  jest.spyOn(pool, "request").mockImplementation(request);
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(request);
  return {
    eventos,
    auditorias
  };
}
test("recupera períodos atrasados, conserva cerrados/pagados y repetir no duplica bitácoras", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-30T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  const periodos = [{
    ...periodoBase
  }, {
    ...periodoBase,
    PeriodoId: 2,
    Estado: "PAGADO"
  }, {
    ...periodoBase,
    PeriodoId: 3,
    Estado: "CERRADO"
  }, {
    ...periodoBase,
    PeriodoId: 4,
    FechaInicio: new Date("2026-11-09"),
    FechaFin: new Date("2026-11-22")
  }, {
    ...periodoBase,
    PeriodoId: 5,
    FechaInicio: new Date("2026-10-26"),
    FechaFin: new Date("2026-11-08")
  }];
  const {
    auditorias
  } = prepararBD(periodos);
  expect(await periodosService.actualizarEstadosPeriodos(7)).toBe(2);
  expect(periodos.map(periodo => periodo.Estado)).toEqual(["CERRADO", "PAGADO", "CERRADO", "PROGRAMADO", "ABIERTO"]);
  expect(await periodosService.actualizarEstadosPeriodos(7)).toBe(0);
  expect(auditorias.length).toBe(2);
  expect(JSON.parse(auditorias[0].DatosNuevos)).toEqual({
    estado: "CERRADO",
    origen: "AUTOMATICO"
  });
  // Ni siquiera un reloj atrasado debe reabrir estados terminales.
  for (const Estado of ["CERRADO", "PAGADO"]) {
    expect(periodosService.determinarEstadoPeriodo({
      ...periodoBase,
      Estado
    }, {
      fechaAsignada: "2026-10-01",
      fechaHoy: "2026-10-01"
    })).toBe(Estado);
  }
});
test("consultar períodos no ejecuta la tarea ni abre transacciones", async () => {
  const {
    eventos,
    auditorias
  } = prepararBD([{
    ...periodoBase
  }]);
  await periodosService.listarPeriodos();
  await periodosService.obtenerPeriodo(1);
  await periodosService.obtenerPeriodoPorFecha("2026-10-12");
  await periodosService.obtenerPeriodoActual();
  expect(eventos).toEqual([]);
  expect(auditorias).toEqual([]);
});
for (const sinActualizacion of [true, false]) {
  test(`tarea ${sinActualizacion ? "omite el cambio concurrente sin auditar" : "revierte si falla la bitácora"}`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-30T18:00:00Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const {
      eventos,
      auditorias
    } = prepararBD([{
      ...periodoBase
    }], {
      sinActualizacion,
      fallaBitacora: !sinActualizacion
    });
    if (sinActualizacion) expect(await periodosService.actualizarEstadosPeriodos(7)).toBe(0);else await assert.rejects(periodosService.actualizarEstadosPeriodos(7), /Fallo de bitácora/);
    expect(eventos.at(-1)).toBe(sinActualizacion ? "commit" : "rollback");
    expect(auditorias.length).toBe(0);
  });
}
for (const [instante, permitido] of [["2026-10-30T05:59:59Z", false], ["2026-10-30T06:00:00Z", true], ["2026-11-01T18:00:00Z", true]]) {
  test(`pago manual según fechaHoy: ${instante}`, async () => {
    jest.useFakeTimers({
      now: new Date(instante),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const periodos = [{
      ...periodoBase,
      Estado: "CERRADO"
    }, {
      ...periodoBase,
      PeriodoId: 2,
      Estado: "ABIERTO"
    }];
    const {
      auditorias,
      eventos
    } = prepararBD(periodos);
    if (permitido) {
      const resultado = await periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7);
      expect(resultado.Estado).toBe("PAGADO");
      expect(auditorias.length).toBe(1);
      expect(eventos.at(-1)).toBe("commit");
    } else {
      await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), {
        status: 409
      });
      expect(auditorias.length).toBe(0);
      expect(eventos.at(-1)).toBe("rollback");
    }
    expect(periodos[1].Estado).toBe("ABIERTO");
  });
}
test("rechaza cambios manuales automáticos, pagos repetidos y pago de períodos no cerrados", async () => {
  const periodos = [{
    ...periodoBase
  }];
  const {
    auditorias
  } = prepararBD(periodos);
  for (const destino of ["PROGRAMADO", "ABIERTO", "EN_REVISION", "CERRADO"]) {
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, destino, 7), {
      status: 409
    });
  }
  for (const Estado of ["PROGRAMADO", "ABIERTO", "EN_REVISION", "PAGADO"]) {
    periodos[0].Estado = Estado;
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), {
      status: 409
    });
  }
  expect(auditorias.length).toBe(0);
});
for (const sinActualizacion of [true, false]) {
  test(`pago ${sinActualizacion ? "detecta actualización concurrente" : "revierte ante fallo de bitácora"}`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-30T18:00:00Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const {
      eventos
    } = prepararBD([{
      ...periodoBase,
      Estado: "CERRADO"
    }], {
      sinActualizacion,
      fallaBitacora: !sinActualizacion
    });
    await assert.rejects(periodosService.cambiarEstadoPeriodo(1, "PAGADO", 7), sinActualizacion ? {
      status: 409
    } : /Fallo de bitácora/);
    expect(eventos.at(-1)).toBe("rollback");
    expect(eventos.includes("commit")).toBe(false);
  });
}
test("filtros de períodos encuentran intersecciones inclusivas y combinan estado, año y búsqueda", () => {
  const periodos = [{
    PeriodoId: 1,
    Estado: "CERRADO",
    FechaInicio: "2026-10-12",
    FechaFin: "2026-10-25"
  }, {
    PeriodoId: 2,
    Estado: "ABIERTO",
    FechaInicio: "2026-10-26",
    FechaFin: "2026-11-08"
  }, {
    PeriodoId: 3,
    Estado: "EN_REVISION",
    FechaInicio: "2025-12-29",
    FechaFin: "2026-01-11"
  }, {
    PeriodoId: 4,
    Estado: "PAGADO",
    FechaInicio: "2026-09-28",
    FechaFin: "2026-10-11"
  }].map(periodo => ({
    ...periodo,
    FechaLimiteAjustes: "2026-10-28",
    FechaPago: "2026-10-30"
  }));
  const original = clonar(periodos);
  const ids = filtros => filtrarPeriodos(periodos, filtros).map(p => p.PeriodoId);
  expect(ids({
    desde: "2026-10-20",
    hasta: "2026-10-21"
  })).toEqual([1]);
  expect(ids({
    desde: "2026-10-25",
    hasta: "2026-10-26"
  })).toEqual([1, 2]);
  expect(ids({
    desde: "2026-10-11",
    hasta: "2026-10-12"
  })).toEqual([1, 4]);
  expect(ids({
    desde: "2026-01-01",
    hasta: "2026-01-02"
  })).toEqual([3]);
  expect(ids({
    desde: "2026-10-26"
  })).toEqual([2]);
  expect(ids({
    hasta: "2026-10-11"
  })).toEqual([3, 4]);
  expect(ids({
    desde: "2026-10-01",
    estado: "CERRADO",
    anio: "2026",
    busqueda: "cerrado"
  })).toEqual([1]);
  expect(ids({
    anio: "2025",
    busqueda: "revision"
  })).toEqual([3]);
  expect(ids({
    estado: "PAGADO"
  })).toEqual([4]);
  expect(ids({
    desde: "2027-01-01"
  })).toEqual([]);
  expect(ids({})).toEqual([1, 2, 3, 4]);
  expect(filtrarPeriodos([], {})).toEqual([]);
  expect(periodos).toEqual(original);
  expect(estadoLabels.PROGRAMADO).toBe("Programado");
  expect(obtenerFechaHoyCostaRica(new Date("2026-10-30T05:59:59Z"))).toBe("2026-10-29");
  expect(obtenerFechaHoyCostaRica(new Date("2026-10-30T06:00:00Z"))).toBe("2026-10-30");
});
test("tarea comparte inicio, crea un solo temporizador y omite ticks mientras está ejecutándose", async () => {
  const {
    eventos
  } = prepararBD([]);
  let callback;
  const temporizador = {};
  const interval = jest.spyOn(globalThis, "setInterval").mockImplementation((fn, ms) => {
    expect(ms).toBe(60_000);
    callback = fn;
    return temporizador;
  });
  const {
    iniciarTareaPeriodos
  } = await import("../../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=unica");
  const inicio = iniciarTareaPeriodos(7);
  expect(iniciarTareaPeriodos(7)).toBe(inicio);
  expect(await inicio).toBe(temporizador);
  expect(await iniciarTareaPeriodos(7)).toBe(temporizador);
  expect(interval.mock.calls.length).toBe(1);
  expect(eventos).toEqual(["begin", "commit"]);
  let terminar;
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(() => new Promise(resolve => {
    terminar = resolve;
  }));
  callback();
  await siguienteTurno();
  callback();
  await siguienteTurno();
  expect(eventos.filter(evento => evento === "begin").length).toBe(2);
  terminar();
  await siguienteTurno();
  callback();
  await siguienteTurno();
  expect(eventos.filter(evento => evento === "begin").length).toBe(3);
  terminar();
  await siguienteTurno();
});
test("tarea permite reintentar si la actualización inicial falla", async () => {
  prepararBD([]);
  const {
    iniciarTareaPeriodos
  } = await import("../../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=fallo");
  const interval = jest.spyOn(globalThis, "setInterval").mockImplementation(() => ({}));
  await assert.rejects(iniciarTareaPeriodos(undefined), {
    status: 400
  });
  expect(interval.mock.calls.length).toBe(0);
  await iniciarTareaPeriodos(7);
  expect(interval.mock.calls.length).toBe(1);
});
test("crear período inserta PROGRAMADO explícitamente y registra el estado en bitácora", async () => {
  const {
    eventos,
    auditorias
  } = prepararBD([]);
  const requestOriginal = sql.Transaction.prototype.request.getMockImplementation();
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    const request = requestOriginal.call(this);
    const queryOriginal = request.query;
    request.query = async function (query) {
      if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
        recordset: []
      };
      if (query.includes("INSERT INTO dbo.PeriodosPlanilla")) {
        expect(query).toMatch(/CreadoPorUsuarioId,\s*Estado/);
        expect(query).toMatch(/'PROGRAMADO'/);
        return {
          recordset: [{
            ...periodoBase
          }]
        };
      }
      return queryOriginal.call(this, query);
    };
    return request;
  });
  const creado = await periodosService.crearPeriodo({
    fechaInicio: "2026-10-12",
    fechaFin: "2026-10-25",
    fechaLimiteAjustes: "2026-10-28",
    fechaPago: "2026-10-30"
  }, 7);
  expect(creado.Estado).toBe("PROGRAMADO");
  expect(JSON.parse(auditorias[0].DatosNuevos).Estado).toBe("PROGRAMADO");
  expect(eventos.at(-1)).toBe("commit");
});
test("un fallo periódico no bloquea las siguientes ejecuciones", async () => {
  prepararBD([]);
  let callback;
  jest.spyOn(globalThis, "setInterval").mockImplementation(fn => {
    callback = fn;
    return {};
  });
  const errores = jest.spyOn(console, "error").mockImplementation(() => {});
  const {
    iniciarTareaPeriodos
  } = await import("../../src/modules/periodoPlanilla/periodosPlanillas.tarea.js?prueba=recuperacion");
  await iniciarTareaPeriodos(7);
  let llamadas = 0;
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {
    llamadas++;
    if (llamadas === 1) throw new Error("SQL no disponible");
  });
  callback();
  await siguienteTurno();
  expect(errores.mock.calls.length).toBe(1);
  callback();
  await siguienteTurno();
  expect(llamadas).toBe(2);
  expect(errores.mock.calls.length).toBe(1);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

