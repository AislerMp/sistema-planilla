import { test, beforeEach, afterEach, jest, expect, beforeAll, afterAll } from "@jest/globals";
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => crearRequest());
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    return crearRequest(this);
  });
  for (const operacion of ["begin", "commit", "rollback"]) {
    jest.spyOn(sql.Transaction.prototype, operacion).mockImplementation(async function () {
      eventos.push({
        operacion,
        transaction: this
      });
    });
  }
});
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import session from "express-session";

// Rutas, controladores y servicios reales; SQL simulado, sin modificar datos.
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
  SESSION_SECRET: "solo-tests"
});
const {
  pool,
  sql
} = await import("../../src/shared/config/database.js");
const {
  default: app
} = await import("../../src/app.js");
const planillasService = await import("../../src/modules/planillas/services/planillas.service.js");
const roles = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
const gestion = ["RECURSOS_HUMANOS", "ADMINISTRADOR"];
const periodo = {
  PeriodoId: 22,
  Estado: "CERRADO",
  FechaInicio: new Date("2026-10-12"),
  FechaFin: new Date("2026-10-25"),
  FechaPago: new Date("2026-10-30")
};
const detalle = {
  DetallePlanillaId: 70,
  PlanillaId: 50,
  ColaboradorId: 2018,
  RestauranteId: 2,
  TarifaHoraAplicada: 1000,
  TotalIngresos: 8000,
  TotalDeducciones: 400,
  TotalNeto: 7600
};
let esperadas, consultas, eventos, identidad, server, baseUrl;
function crearRequest(transaction = null) {
  const parametros = {};
  return {
    input(nombre, _tipo, valor) {
      parametros[nombre] = valor;
      return this;
    },
    async query(query) {
      const respuesta = esperadas.shift();
      assert.ok(respuesta, `Consulta inesperada: ${query}`);
      expect(query).toMatch(respuesta.pattern);
      consultas.push({
        query,
        parametros,
        transaction
      });
      if (respuesta.error) throw respuesta.error;
      return {
        recordset: respuesta.filas,
        rowsAffected: [1]
      };
    }
  };
}
beforeAll(async () => {
  const harness = express();
  harness.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));
  harness.use((req, _res, next) => {
    if (identidad) req.session.user = {
      Activo: true,
      UsuarioId: 7,
      ColaboradorId: 2018,
      ...identidad
    };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/planillas`;
});
afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  jest.restoreAllMocks();
});
beforeEach(() => {
  esperadas = [];
  consultas = [];
  eventos = [];
  identidad = undefined;
});
afterEach(() => assert.equal(esperadas.length, 0, "Faltan consultas esperadas"));
function responder(pattern, filas = [], error) {
  esperadas.push({
    pattern,
    filas,
    error
  });
}
function request(method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
for (const [method, path, permitidos] of [["GET", "/", gestion], ["GET", "/50", gestion], ["GET", "/mis-detalles/22", ["COLABORADOR"]], ["GET", "/restaurante", ["GERENTE"]], ["GET", "/restaurante/22", ["GERENTE"]], ["GET", "/detalles/70/conceptos", roles], ["GET", "/periodos/22/preplanilla", roles], ["GET", "/periodos/22/detalles", gestion], ["GET", "/periodos/22/restaurantes/2", gestion], ["POST", "/periodos/22/pagar", gestion]]) {
  test(`${method} ${path} exige una sesión y limita los roles`, async () => {
    expect((await request(method, path)).status).toBe(401);
    for (const Rol of [...roles.filter(rol => !permitidos.includes(rol)), "DESCONOCIDO"]) {
      identidad = {
        Rol
      };
      expect((await request(method, path)).status).toBe(403);
    }
    expect(consultas.length).toBe(0);
  });
}
test("RH y administración pueden listar y consultar una planilla por ID", async () => {
  for (const Rol of gestion) {
    identidad = {
      Rol
    };
    responder(/FROM dbo.Planillas/);
    expect(await (await request("GET", "/")).json()).toEqual([]);
    responder(/WHERE PlanillaId = @planillaId/, [{
      PlanillaId: 50
    }]);
    expect(await (await request("GET", "/50")).json()).toEqual({
      PlanillaId: 50
    });
    expect(consultas.at(-1).parametros.planillaId).toBe(50);
  }
  expect((await request("GET", "/incorrecto")).status).toBe(400);
  responder(/FROM dbo.Planillas/);
  expect((await request("GET", "/999")).status).toBe(404);
});
test("mis detalles utiliza el colaborador de la sesión y el período de la ruta", async () => {
  identidad = {
    Rol: "COLABORADOR"
  };
  responder(/dp.ColaboradorId = @colaboradorId/, [detalle]);
  const response = await request("GET", "/mis-detalles/22?colaboradorId=999");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(detalle);
  expect(consultas[0].parametros.colaboradorId).toBe(2018);
  expect(consultas[0].parametros.periodoId).toBe(22);
  expect((await request("GET", "/mis-detalles/incorrecto")).status).toBe(400);
  responder(/FROM dbo.DetallesPlanilla/);
  expect((await request("GET", "/mis-detalles/23")).status).toBe(404);
});
test("el gerente consulta su restaurante vigente aunque la sesión o el cliente indiquen otro", async () => {
  identidad = {
    Rol: "GERENTE",
    RestauranteId: 99
  };
  for (const path of ["/restaurante", "/restaurante/22?restauranteId=99"]) {
    responder(/FROM Usuarios AS u/, [{
      RestauranteId: 2
    }]);
    responder(/dp.RestauranteId = @restauranteId/, [detalle]);
    const response = await request("GET", path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([detalle]);
    expect(consultas.at(-1).parametros.restauranteId).toBe(2);
    expect(consultas.at(-1).parametros.periodoId).toBe(path === "/restaurante" ? null : 22);
  }
});
test("RH y administración consultan los detalles del período con o sin restaurante", async () => {
  for (const Rol of gestion) {
    identidad = {
      Rol
    };
    for (const restauranteId of [null, 2]) {
      responder(/WHERE PeriodoId = @periodoId/, [{
        PlanillaId: 50
      }]);
      responder(/FROM dbo.DetallesPlanilla/, [detalle]);
      const path = restauranteId === null ? "/periodos/22/detalles" : "/periodos/22/restaurantes/2";
      const response = await request("GET", path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        planilla: {
          PlanillaId: 50
        },
        detalles: [detalle]
      });
      expect(consultas.at(-1).parametros.restauranteId).toBe(restauranteId);
    }
  }
  expect((await request("GET", "/periodos/22/restaurantes/incorrecto")).status).toBe(400);
});
test("un restaurante sin pagos devuelve una lista vacía y conserva la planilla del período", async () => {
  identidad = {
    Rol: "RECURSOS_HUMANOS"
  };
  responder(/WHERE PeriodoId = @periodoId/, [{
    PlanillaId: 50
  }]);
  responder(/FROM dbo.DetallesPlanilla/);
  const response = await request("GET", "/periodos/22/restaurantes/3");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    planilla: {
      PlanillaId: 50
    },
    detalles: []
  });
  expect(consultas.at(-1).parametros.restauranteId).toBe(3);
});
test("consultar un período sin planilla registrada mantiene el 404", async () => {
  identidad = {
    Rol: "ADMINISTRADOR"
  };
  responder(/WHERE PeriodoId = @periodoId/);
  const response = await request("GET", "/periodos/22/detalles");
  expect(response.status).toBe(404);
  expect((await response.json()).message).toMatch(/No existe una planilla registrada/);
  expect(consultas.length).toBe(1);
});
test("los conceptos se pueden consultar por el propietario, su gerente, RH y administración", async () => {
  for (const Rol of roles) {
    identidad = {
      Rol
    };
    responder(/WHERE DetallePlanillaId = @detallePlanillaId/, [detalle]);
    if (Rol === "GERENTE") responder(/FROM Usuarios AS u/, [{
      RestauranteId: 2
    }]);
    responder(/FROM dbo.ConceptosPlanilla/, [{
      CodigoConcepto: "ORDINARIAS",
      Monto: 8000
    }]);
    const response = await request("GET", "/detalles/70/conceptos");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{
      CodigoConcepto: "ORDINARIAS",
      Monto: 8000
    }]);
  }
});
test("los conceptos de otro colaborador o restaurante se rechazan antes de consultarlos", async () => {
  identidad = {
    Rol: "COLABORADOR"
  };
  responder(/FROM dbo.DetallesPlanilla/, [{
    ...detalle,
    ColaboradorId: 99
  }]);
  expect((await request("GET", "/detalles/70/conceptos")).status).toBe(403);
  identidad = {
    Rol: "GERENTE",
    RestauranteId: 2
  };
  responder(/FROM dbo.DetallesPlanilla/, [{
    ...detalle,
    RestauranteId: 3
  }]);
  responder(/FROM Usuarios AS u/, [{
    RestauranteId: 2
  }]);
  expect((await request("GET", "/detalles/70/conceptos")).status).toBe(403);
  responder(/FROM dbo.DetallesPlanilla/);
  expect((await request("GET", "/detalles/999/conceptos")).status).toBe(404);
  expect((await request("GET", "/detalles/incorrecto/conceptos")).status).toBe(400);
  expect(consultas.every(c => !c.query.includes("FROM dbo.ConceptosPlanilla"))).toBeTruthy();
});
function responderCalculo() {
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Colaboradores AS c/, [{
    ColaboradorId: 2018,
    RestauranteId: 2,
    TarifaHora: 1000
  }]);
  responderFuentesCalculo();
}
function responderFuentesCalculo() {
  responder(/FROM dbo.AsistenciasDiarias/, [{
    FechaAsignada: new Date("2026-10-12"),
    TipoJornada: "DIURNA",
    MinutosEfectivos: 480,
    MinutosExtras: 0
  }]);
  responder(/FROM dbo.Feriados/);
  responder(/FROM dbo.CalculosVacaciones/);
  responder(/FROM dbo.CalculosIncapacidad/);
  responder(/TipoDeduccion = 'LEGAL'/, [{
    Codigo: "CCSS",
    Porcentaje: 5
  }]);
  responder(/FROM dbo.SolicitudesDeducciones/);
}
test("la preplanilla responde sin escrituras ni transacciones", async () => {
  identidad = {
    Rol: "RECURSOS_HUMANOS"
  };
  responderCalculo();
  const response = await request("GET", "/periodos/22/preplanilla");
  expect(response.status).toBe(200);
  const resultado = await response.json();
  expect(resultado.resumenGeneralPlanilla).toEqual({
    totalIngresos: 8000,
    totalDeducciones: 400,
    totalNeto: 7600
  });
  expect(resultado.detallesCalculados[0].colaboradorId).toBe(2018);
  expect(consultas.every(c => !/\b(INSERT|UPDATE|DELETE)\b/.test(c.query))).toBeTruthy();
  expect(eventos).toEqual([]);
});
test("preplanilla del colaborador calcula solo la sesión y obtiene la tarifa desde su puesto", async () => {
  identidad = {
    Rol: "COLABORADOR",
    ColaboradorId: "2018"
  };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Colaboradores WHERE ColaboradorId = @id/, [{
    ColaboradorId: 2018,
    RestauranteId: 2,
    PuestoId: 8
  }]);
  responder(/FROM Puestos.*WHERE PuestoId = @id/, [{
    PuestoId: 8,
    TarifaHora: 1900
  }]);
  responderFuentesCalculo();
  const response = await request("GET", "/periodos/22/preplanilla?colaboradorId=5&restauranteId=3");
  expect(response.status).toBe(200);
  const resultado = await response.json();
  expect(resultado.detallesCalculados.map(d => d.colaboradorId)).toEqual([2018]);
  expect(resultado.detallesCalculados[0].tarifaHoraAplicada).toBe(1900);
  expect(resultado.resumenGeneralPlanilla).toEqual({
    totalIngresos: 15200,
    totalDeducciones: 760,
    totalNeto: 14440
  });
  expect(consultas[1].parametros.id).toBe(2018);
  expect(consultas[2].parametros.id).toBe(8);
  expect(consultas.find(c => /FROM dbo.AsistenciasDiarias/.test(c.query)).parametros.ColaboradorId).toBe(2018);
  expect(consultas.every(c => !/FROM Colaboradores AS c/.test(c.query))).toBeTruthy();
});
test("preplanilla del gerente incluye solo su restaurante vigente y calcula sus totales", async () => {
  identidad = {
    Rol: "GERENTE",
    RestauranteId: 99
  };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Usuarios AS u/, [{
    RestauranteId: 2
  }]);
  responder(/WHERE c.RestauranteId = @restauranteId/, [{
    ColaboradorId: 2018,
    RestauranteId: 2,
    TarifaHora: 1000
  }, {
    ColaboradorId: 5,
    RestauranteId: 2,
    TarifaHora: 1000
  }]);
  responderFuentesCalculo();
  responderFuentesCalculo();
  const response = await request("GET", "/periodos/22/preplanilla?restauranteId=99");
  expect(response.status).toBe(200);
  const resultado = await response.json();
  expect(resultado.detallesCalculados.map(d => d.colaboradorId)).toEqual([2018, 5]);
  expect(resultado.detallesCalculados.every(d => d.restauranteId === 2)).toBeTruthy();
  expect(consultas[1].parametros.usuarioId).toBe(7);
  expect(consultas[2].parametros.restauranteId).toBe(2);
  expect(resultado.resumenGeneralPlanilla).toEqual({
    totalIngresos: 16000,
    totalDeducciones: 800,
    totalNeto: 15200
  });
});
for (const Rol of gestion) {
  test(`preplanilla general para ${Rol} incluye colaboradores de distintos restaurantes`, async () => {
    identidad = {
      Rol
    };
    responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
    responder(/FROM Colaboradores AS c/, [{
      ColaboradorId: 2018,
      RestauranteId: 2,
      TarifaHora: 1000
    }, {
      ColaboradorId: 5,
      RestauranteId: 3,
      TarifaHora: 1000
    }]);
    responderFuentesCalculo();
    responderFuentesCalculo();
    const response = await request("GET", "/periodos/22/preplanilla");
    expect(response.status).toBe(200);
    const resultado = await response.json();
    expect(resultado.detallesCalculados.map(d => d.restauranteId)).toEqual([2, 3]);
    expect(consultas[1].parametros.restauranteId).toBe(undefined);
    assert.doesNotMatch(consultas[1].query, /WHERE c.RestauranteId/);
    expect(resultado.resumenGeneralPlanilla).toEqual({
      totalIngresos: 16000,
      totalDeducciones: 800,
      totalNeto: 15200
    });
  });
}
test("roles desconocidos o un usuario ausente se rechazan en el servicio antes de consultar SQL", async () => {
  for (const usuario of [undefined, null, {}, {
    Rol: "COLABORADORES"
  }, {
    Rol: "DESCONOCIDO"
  }]) {
    await assert.rejects(planillasService.calcularPreplanilla(22, usuario), {
      status: 403
    });
  }
  for (const Rol of ["COLABORADOR", "GERENTE", "DESCONOCIDO"]) {
    await assert.rejects(planillasService.registrarPagoPlanilla(22, {
      UsuarioId: 7,
      Rol
    }), {
      status: 403
    });
  }
  expect(consultas).toEqual([]);
  expect(eventos).toEqual([]);
});
test("un gerente sin restaurante asignado no obtiene la consulta general", async () => {
  identidad = {
    Rol: "GERENTE"
  };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Usuarios AS u/);
  expect((await request("GET", "/periodos/22/preplanilla")).status).toBe(403);
  expect(consultas.length).toBe(2);
});
test("un colaborador inexistente no obtiene la consulta general", async () => {
  identidad = {
    Rol: "COLABORADOR"
  };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Colaboradores WHERE ColaboradorId = @id/);
  expect((await request("GET", "/periodos/22/preplanilla")).status).toBe(404);
  expect(consultas.length).toBe(2);
});
for (const tarifa of [null, 0, -1]) {
  test(`la preplanilla rechaza la tarifa ${tarifa} del puesto del colaborador`, async () => {
    identidad = {
      Rol: "COLABORADOR"
    };
    responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
    responder(/FROM Colaboradores WHERE ColaboradorId = @id/, [{
      ColaboradorId: 2018,
      PuestoId: 8
    }]);
    responder(/FROM Puestos/, [{
      PuestoId: 8,
      TarifaHora: tarifa
    }]);
    expect((await request("GET", "/periodos/22/preplanilla")).status).toBe(409);
    expect(consultas.length).toBe(3);
  });
}
test("pagar toma el usuario de la sesión y guarda todo en una misma transacción", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-30T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  identidad = {
    Rol: "RECURSOS_HUMANOS"
  };
  responder(/WITH \(UPDLOCK, HOLDLOCK\)/, [periodo]);
  responder(/FROM dbo.Planillas/);
  responder(/INSERT INTO dbo.Planillas/, [{
    PlanillaId: 50
  }]);
  responderCalculo();
  responder(/INSERT INTO dbo.DetallesPlanilla/, [detalle]);
  responder(/FROM dbo.DetallesPlanilla/, [detalle]);
  responder(/INSERT INTO dbo.ConceptosPlanilla/, [{
    ConceptoPlanillaId: 1
  }]);
  responder(/INSERT INTO dbo.ConceptosPlanilla/, [{
    ConceptoPlanillaId: 2
  }]);
  responder(/UPDATE dbo.Planillas/, [{
    PlanillaId: 50,
    TotalNeto: 7600
  }]);
  responder(/UPDATE dbo.PeriodosPlanilla/, [{
    ...periodo,
    Estado: "PAGADO"
  }]);
  responder(/INSERT INTO dbo.Bitacora/);
  responder(/INSERT INTO dbo.Bitacora/);
  const response = await request("POST", "/periodos/22/pagar", {
    usuario: {
      UsuarioId: 999
    }
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    PlanillaId: 50,
    TotalNeto: 7600
  });
  expect(consultas.find(c => /INSERT INTO dbo.Planillas/.test(c.query)).parametros.registradoPorUsuarioId).toBe(7);
  expect(consultas.filter(c => /INSERT INTO dbo.Bitacora/.test(c.query)).every(c => c.parametros.UsuarioId === 7)).toBeTruthy();
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "commit"]);
  expect(consultas.every(c => c.transaction === eventos[0].transaction)).toBeTruthy();
});
test("pagar revierte si el período no está cerrado, sin insertar la planilla", async () => {
  identidad = {
    Rol: "ADMINISTRADOR"
  };
  responder(/FROM dbo.PeriodosPlanilla/, [{
    ...periodo,
    Estado: "ABIERTO"
  }]);
  expect((await request("POST", "/periodos/22/pagar")).status).toBe(409);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
  expect(consultas.length).toBe(1);
});
test("pagar revierte todo si falla un concepto y conserva la transacción en los cálculos", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-30T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  identidad = {
    Rol: "ADMINISTRADOR"
  };
  responder(/WITH \(UPDLOCK, HOLDLOCK\)/, [periodo]);
  responder(/FROM dbo.Planillas/);
  responder(/INSERT INTO dbo.Planillas/, [{
    PlanillaId: 50
  }]);
  responderCalculo();
  responder(/INSERT INTO dbo.DetallesPlanilla/, [detalle]);
  responder(/FROM dbo.DetallesPlanilla/, [detalle]);
  responder(/INSERT INTO dbo.ConceptosPlanilla/, [], new Error("Fallo al insertar concepto"));
  expect((await request("POST", "/periodos/22/pagar")).status).toBe(500);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
  expect(consultas.every(c => c.transaction === eventos[0].transaction)).toBeTruthy();
});
test("un pago duplicado se rechaza antes de insertar otra planilla", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-30T18:00:00Z"), doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  identidad = { Rol: "RECURSOS_HUMANOS" };
  responder(/WITH \(UPDLOCK, HOLDLOCK\)/, [periodo]);
  responder(/FROM dbo.Planillas/, [{ PlanillaId: 50 }]);

  const response = await request("POST", "/periodos/22/pagar");

  expect(response.status).toBe(409);
  expect((await response.json()).message).toMatch(/ya tiene una planilla/);
  expect(consultas.some(c => /INSERT|UPDATE/.test(c.query))).toBe(false);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
});

test("no permite pagar antes de la fecha de pago del período", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-29T18:00:00Z"), doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  identidad = { Rol: "RECURSOS_HUMANOS" };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);

  const response = await request("POST", "/periodos/22/pagar");

  expect(response.status).toBe(409);
  expect((await response.json()).message).toMatch(/fecha de pago/);
  expect(consultas).toHaveLength(1);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
});

test("revierte la cabecera inicial si ningún colaborador tiene ingresos", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-30T18:00:00Z"), doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  identidad = { Rol: "RECURSOS_HUMANOS" };
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM dbo.Planillas/);
  responder(/INSERT INTO dbo.Planillas/, [{ PlanillaId: 50 }]);
  responder(/FROM dbo.PeriodosPlanilla/, [periodo]);
  responder(/FROM Colaboradores AS c/, [{ ColaboradorId: 2018, RestauranteId: 2, TarifaHora: 1000 }]);
  responder(/FROM dbo.AsistenciasDiarias/);
  responder(/FROM dbo.Feriados/);
  responder(/FROM dbo.CalculosVacaciones/);
  responder(/FROM dbo.CalculosIncapacidad/);
  responder(/TipoDeduccion = 'LEGAL'/, [{ Codigo: "CCSS", Porcentaje: 5.5 }]);
  responder(/FROM dbo.SolicitudesDeducciones/);

  const response = await request("POST", "/periodos/22/pagar");

  expect(response.status).toBe(409);
  expect((await response.json()).message).toMatch(/No hay ingresos/);
  expect(consultas.some(c => /INSERT INTO dbo.(DetallesPlanilla|ConceptosPlanilla)/.test(c.query))).toBe(false);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

