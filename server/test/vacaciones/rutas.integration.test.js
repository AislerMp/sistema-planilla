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

// Requests SQL simulados: se prueban las rutas, controllers y servicios reales.
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
const fecha = texto => new Date(`${texto}T00:00:00.000Z`);
const solicitud = {
  SolicitudId: 31,
  TipoSolicitud: "VACACIONES",
  ColaboradorId: 4,
  RestauranteId: 2,
  Estado: "PENDIENTE",
  DiasSolicitados: 14,
  FechaInicio: fecha("2026-10-15"),
  FechaFin: fecha("2026-10-28")
};
const saldo = {
  ColaboradorId: 4,
  DiasAcumulados: 22,
  DiasUtilizados: 2,
  DiasDisponibles: 20
};
const roles = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
const json = value => JSON.parse(JSON.stringify(value));
let expected, calls, eventos, identity, server, baseUrl;
function crearRequest(transaction = null) {
  const parametros = {};
  return {
    input(nombre, _tipo, valor) {
      parametros[nombre] = valor;
      return this;
    },
    async query(query) {
      const respuesta = expected.shift();
      assert.ok(respuesta, `Consulta inesperada: ${query}`);
      expect(query).toMatch(respuesta.pattern);
      calls.push({
        query,
        parametros,
        transaction
      });
      if (respuesta.error) throw respuesta.error;
      return {
        recordset: respuesta.records,
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
    if (identity) req.session.user = {
      Activo: true,
      UsuarioId: 7,
      ColaboradorId: 4,
      ...identity
    };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/vacaciones`;
});
afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  jest.restoreAllMocks();
});
beforeEach(() => {
  expected = [];
  calls = [];
  eventos = [];
  identity = undefined;
});
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));
function respond(pattern, records = [], error) {
  expected.push({
    pattern,
    records,
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
for (const [method, path, permitidos] of [["GET", "/mis-vacaciones", ["COLABORADOR"]], ["GET", "/mi-saldo", ["COLABORADOR"]], ["GET", "/saldos/4", ["RECURSOS_HUMANOS", "ADMINISTRADOR"]], ["GET", "/restaurante", roles.slice(1)], ["GET", "/restaurante/2", roles.slice(1)], ["GET", "/31", roles], ["GET", "/31/calculos", ["RECURSOS_HUMANOS", "ADMINISTRADOR"]], ["POST", "/", ["COLABORADOR"]], ["PATCH", "/31/revisar-gerente", ["GERENTE"]], ["PATCH", "/31/resolver-rh", ["RECURSOS_HUMANOS"]], ["PATCH", "/31/revertir", ["GERENTE", "RECURSOS_HUMANOS"]]]) {
  test(`${method} ${path} exige sesión y respeta los roles`, async () => {
    expect((await request(method, path)).status).toBe(401);
    for (const Rol of [...roles.filter(rol => !permitidos.includes(rol)), "DESCONOCIDO"]) {
      identity = {
        Rol
      };
      expect((await request(method, path)).status).toBe(403);
    }
    expect(calls.length).toBe(0);
  });
}
test("mis vacaciones devuelve un array y toma el colaborador de la sesión", async () => {
  identity = {
    Rol: "COLABORADOR"
  };
  respond(/FROM dbo.Vacaciones/, [solicitud]);
  const response = await request("GET", "/mis-vacaciones?colaboradorId=999&desde=2026-10-01&hasta=2026-10-31&estado=pendiente");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(json([solicitud]));
  expect(calls[0].parametros.colaboradorId).toBe(4);
  expect(calls[0].parametros.estado).toBe("PENDIENTE");
  expect(calls[0].parametros.desde.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  for (const filtro of ["estado=INVALIDO", "desde=2026-02-30", "desde=2026-11-01&hasta=2026-10-01"]) {
    expect((await request("GET", `/mis-vacaciones?${filtro}`)).status).toBe(400);
  }
  respond(/FROM dbo.Vacaciones/);
  expect(await (await request("GET", "/mis-vacaciones")).json()).toEqual([]);
});
test("detalle limita al propietario y al restaurante vigente del gerente", async () => {
  identity = {
    Rol: "COLABORADOR"
  };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  expect(await (await request("GET", "/31")).json()).toEqual(json(solicitud));
  respond(/FROM dbo.Solicitudes AS s/, [{
    ...solicitud,
    ColaboradorId: 99
  }]);
  expect((await request("GET", "/31")).status).toBe(403);
  identity = {
    Rol: "GERENTE",
    RestauranteId: 2
  };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{
    RestauranteId: 3
  }]);
  expect((await request("GET", "/31")).status).toBe(403);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  expect((await request("GET", "/31")).status).toBe(200);
  for (const Rol of roles.slice(2)) {
    identity = {
      Rol
    };
    respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
    expect((await request("GET", "/31")).status).toBe(200);
  }
  respond(/FROM dbo.Solicitudes AS s/);
  expect((await request("GET", "/31")).status).toBe(404);
  expect((await request("GET", "/abc")).status).toBe(400);
});
test("RH y Administración consultan todos los cálculos de una solicitud existente", async () => {
  const calculos = [{
    CalculoVacacionId: 1,
    SolicitudId: 31,
    PeriodoId: 8,
    FechaInicioReconocida: fecha("2026-10-15"),
    FechaFinReconocida: fecha("2026-10-18"),
    DiasReconocidos: 4,
    MinutosReconocidos: 1920
  }, {
    CalculoVacacionId: 2,
    SolicitudId: 31,
    PeriodoId: 9,
    FechaInicioReconocida: fecha("2026-10-19"),
    FechaFinReconocida: fecha("2026-10-28"),
    DiasReconocidos: 10,
    MinutosReconocidos: 4800
  }];
  for (const Rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    identity = {
      Rol
    };
    respond(/FROM dbo.Solicitudes AS s/, [{
      ...solicitud,
      Estado: "APROBADA"
    }]);
    respond(/FROM dbo.CalculosVacaciones/, calculos);
    const response = await request("GET", "/31/calculos");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(json(calculos));
    expect(calls.at(-1).parametros.solicitudId).toBe(31);
    expect(calls.at(-1).query).toMatch(/ORDER BY FechaInicioReconocida, PeriodoId/);
  }
  assert.equal(eventos.length, 0, "La consulta no debe crear transacciones");
});
test("cálculos: lista vacía, solicitud inexistente e ID inválido", async () => {
  identity = {
    Rol: "RECURSOS_HUMANOS"
  };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM dbo.CalculosVacaciones/);
  const response = await request("GET", "/31/calculos");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  respond(/FROM dbo.Solicitudes AS s/);
  expect((await request("GET", "/99/calculos")).status).toBe(404);
  expect((await request("GET", "/abc/calculos")).status).toBe(400);
});
test("gerente consulta solo su restaurante, por ruta, query o sin filtro", async () => {
  identity = {
    Rol: "GERENTE",
    RestauranteId: 999
  };
  for (const path of ["/restaurante", "/restaurante/2", "/restaurante?restauranteId=2"]) {
    respond(/FROM Usuarios/, [{
      RestauranteId: 2
    }]);
    respond(/FROM dbo.Vacaciones/, [solicitud]);
    const response = await request("GET", path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(json([solicitud]));
    expect(calls.at(-1).parametros.restauranteId).toBe(2);
  }
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  expect((await request("GET", "/restaurante/3")).status).toBe(403);
  respond(/FROM Usuarios/, [{
    RestauranteId: null
  }]);
  expect((await request("GET", "/restaurante")).status).toBe(403);
  expect((await request("GET", "/restaurante?estado=INVALIDO")).status).toBe(400);
});
test("RH y administrador pueden listar todos los restaurantes o filtrar uno", async () => {
  for (const Rol of roles.slice(2)) {
    identity = {
      Rol
    };
    for (const path of ["/restaurante", "/restaurante/2", "/restaurante?restauranteId=2"]) {
      respond(/FROM dbo.Vacaciones/, [solicitud]);
      expect((await request("GET", path)).status).toBe(200);
      expect(calls.at(-1).parametros.restauranteId).toBe(path === "/restaurante" ? null : 2);
      expect(calls.at(-1).query).toMatch(/@restauranteId IS NULL OR s.RestauranteId = @restauranteId/);
    }
    expect((await request("GET", "/restaurante/abc")).status).toBe(400);
  }
});
test("saldos: el colaborador consulta el suyo; RH y administrador consultan por ID", async () => {
  identity = {
    Rol: "COLABORADOR"
  };
  respond(/FROM dbo.SaldosVacaciones/, [saldo]);
  expect(await (await request("GET", "/mi-saldo?colaboradorId=999")).json()).toEqual(saldo);
  expect(calls.at(-1).parametros.colaboradorId).toBe(4);
  for (const Rol of roles.slice(2)) {
    identity = {
      Rol
    };
    respond(/FROM dbo.SaldosVacaciones/, [saldo]);
    expect(await (await request("GET", "/saldos/4")).json()).toEqual(saldo);
    expect(calls.at(-1).parametros.colaboradorId).toBe(4);
  }
  respond(/FROM dbo.SaldosVacaciones/);
  expect((await request("GET", "/saldos/99")).status).toBe(404);
  expect((await request("GET", "/saldos/abc")).status).toBe(400);
});
test("POST crea con JSON y usa la identidad y restaurante reales", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-05T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  identity = {
    Rol: "COLABORADOR"
  };
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 4,
    RestauranteId: 2
  }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
    ColaboradorId: 4
  }]);
  respond(/FROM dbo.Vacaciones/);
  respond(/FROM dbo.SaldosVacaciones/, [saldo]);
  respond(/SELECT TOP \(1\) s.SolicitudId/);
  respond(/FROM dbo.Incapacidades/);
  respond(/INSERT INTO dbo.Solicitudes/, [{
    SolicitudId: 31
  }]);
  respond(/INSERT INTO dbo.Vacaciones/, [solicitud]);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/INSERT INTO dbo.Bitacora/);
  const response = await request("POST", "/", {
    fechaInicio: "2026-10-15",
    fechaFin: "2026-10-28",
    motivo: " Descanso ",
    colaboradorId: 999,
    restauranteId: 999,
    registradoPorUsuarioId: 999
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual(json(solicitud));
  const cabecera = calls.find(c => c.query.includes("INSERT INTO dbo.Solicitudes"));
  expect(cabecera.parametros.colaboradorId).toBe(4);
  expect(cabecera.parametros.restauranteId).toBe(2);
  expect(cabecera.parametros.registradoPorUsuarioId).toBe(7);
  expect(calls.find(c => c.query.includes("INSERT INTO dbo.Vacaciones")).parametros.diasSolicitados).toBe(14);
  expect(calls.at(-1).parametros.Entidad).toBe("Vacaciones");
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "commit"]);
});
for (const gerente of [true, false]) {
  test(`PATCH ${gerente ? "gerente" : "RH"} usa el revisor de la sesión y registra bitácora`, async () => {
    identity = {
      Rol: gerente ? "GERENTE" : "RECURSOS_HUMANOS"
    };
    const anterior = {
      ...solicitud,
      Estado: gerente ? "PENDIENTE" : "EN_REVISION_RH"
    };
    const estado = gerente ? "EN_REVISION_RH" : "RECHAZADA";
    const campo = gerente ? "revisadoPorGerenteId" : "revisadoPorRhId";
    const nueva = {
      ...anterior,
      Estado: estado
    };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (gerente) {
      respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
        ColaboradorId: 4
      }]);
      respond(/FROM dbo.Solicitudes AS s/, [anterior]);
      respond(/FROM Usuarios/, [{
        RestauranteId: 2
      }]);
      respond(/FROM dbo.Vacaciones/);
    } else respond(/FROM dbo.Vacaciones/, [anterior]);
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: estado.toLowerCase(),
      observacion: " Revisada ",
      [campo]: 999
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(json(gerente ? nueva : {
      vacacionActualizada: nueva,
      registroCalculoCreado: null
    }));
    expect(calls.at(-2).parametros[campo]).toBe(7);
    expect(calls.at(-2).parametros.observacion).toBe("Revisada");
    expect(calls.at(-1).parametros.UsuarioId).toBe(7);
    expect(eventos.map(e => e.operacion)).toEqual(["begin", "commit"]);
    expect((await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: "INVALIDO"
    })).status).toBe(400);
  });
}
for (const fallaSegundo of [false, true]) {
  test(`aprobar por HTTP ${fallaSegundo ? "revierte si falla el segundo cálculo" : "devuelve los dos cálculos y confirma la bitácora"}`, async () => {
    identity = {
      Rol: "RECURSOS_HUMANOS"
    };
    const aprobada = {
      ...solicitud,
      Estado: "APROBADA"
    };
    const calculos = [{
      CalculoVacacionId: 1,
      SolicitudId: 31,
      PeriodoId: 3,
      DiasReconocidos: 4,
      MinutosReconocidos: 1920
    }, {
      CalculoVacacionId: 2,
      SolicitudId: 31,
      PeriodoId: 9,
      DiasReconocidos: 10,
      MinutosReconocidos: 4800
    }];
    respond(/FROM dbo.Solicitudes AS s/, [{
      ...solicitud,
      Estado: "EN_REVISION_RH"
    }]);
    respond(/FROM dbo.Vacaciones/);
    respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
      ColaboradorId: 4
    }]);
    respond(/FROM dbo.Vacaciones/);
    respond(/FROM dbo.SaldosVacaciones/, [saldo]);
    respond(/UPDATE dbo.Solicitudes/, [aprobada]);
    respond(/FROM dbo.CalculosVacaciones/);
    respond(/FROM dbo.Solicitudes AS s/, [aprobada]);
    respond(/FROM dbo.PeriodosPlanilla/, [{
      PeriodoId: 3,
      FechaFin: fecha("2026-10-18"),
      Estado: "ABIERTO"
    }]);
    respond(/FROM dbo.PeriodosPlanilla/, [{
      PeriodoId: 9,
      FechaFin: fecha("2026-11-01"),
      Estado: "PROGRAMADO"
    }]);
    respond(/INSERT INTO dbo.CalculosVacaciones/, [calculos[0]]);
    respond(/INSERT INTO dbo.CalculosVacaciones/, fallaSegundo ? [] : [calculos[1]]);
    if (!fallaSegundo) {
      respond(/FROM dbo.SaldosVacaciones/, [saldo]);
      respond(/UPDATE dbo.SaldosVacaciones/, [{ ...saldo, DiasUtilizados: 16, DiasDisponibles: 6 }]);
      respond(/INSERT INTO dbo.Bitacora/);
    }
    const response = await request("PATCH", "/31/resolver-rh", {
      estado: "APROBADA"
    });
    expect(response.status).toBe(fallaSegundo ? 500 : 200);
    expect(eventos.map(e => e.operacion)).toEqual(["begin", fallaSegundo ? "rollback" : "commit"]);
    expect(calls.every(c => c.transaction === eventos[0].transaction)).toBeTruthy();
    if (!fallaSegundo) {
      expect(await response.json()).toEqual(json({
        vacacionActualizada: aprobada,
        registroCalculoCreado: calculos
      }));
      expect(calls.at(-1).parametros.Accion).toBe("APROBAR_VACACIONES");
    }
  });
}
for (const caso of [{
  rol: "GERENTE",
  estado: "EN_REVISION_RH",
  rh: null,
  destino: "PENDIENTE"
}, {
  rol: "GERENTE",
  estado: "RECHAZADA",
  rh: null,
  destino: "PENDIENTE"
}, {
  rol: "RECURSOS_HUMANOS",
  estado: "RECHAZADA",
  rh: 9,
  destino: "EN_REVISION_RH"
}]) {
  test(`reversión HTTP ${caso.rol}: ${caso.estado} a ${caso.destino} con motivo y bitácora`, async () => {
    identity = {
      Rol: caso.rol
    };
    const anterior = {
      ...solicitud,
      Estado: caso.estado,
      RevisadoPorGerenteId: 8,
      RevisadoPorRhId: caso.rh
    };
    const nueva = {
      ...anterior,
      Estado: caso.destino,
      RevisadoPorGerenteId: caso.destino === "PENDIENTE" ? null : 8,
      RevisadoPorRhId: null,
      Observacion: null
    };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
      ColaboradorId: 4
    }]);
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (caso.rol === "GERENTE") respond(/FROM Usuarios/, [{
      RestauranteId: 2
    }]);
    respond(/FROM dbo.CalculosVacaciones/);
    respond(/FROM dbo.Vacaciones/, caso.estado === "EN_REVISION_RH" ? [anterior] : []);
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", "/31/revertir", {
      motivo: " Corregir revisión ",
      usuarioId: 999
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(json(nueva));
    const actualizacion = calls.find(c => c.query.includes("UPDATE dbo.Solicitudes"));
    expect(actualizacion.parametros.estadoDestino).toBe(caso.destino);
    expect(actualizacion.query).toMatch(/AND Estado = @estadoActual/);
    const auditoria = calls.at(-1).parametros;
    expect(auditoria.UsuarioId).toBe(7);
    expect(auditoria.Entidad).toBe("Vacaciones");
    expect(auditoria.Accion).toBe("REVERTIR");
    expect(JSON.parse(auditoria.DatosAnteriores)).toEqual(json(anterior));
    expect(JSON.parse(auditoria.DatosNuevos)).toEqual(json({
      ...nueva,
      motivoReversion: "Corregir revisión"
    }));
    expect(eventos.map(e => e.operacion)).toEqual(["begin", "commit"]);
    expect(calls.filter(c => !c.query.includes("FROM Usuarios")).every(c => c.transaction === eventos[0].transaction)).toBeTruthy();
    expect(calls.every(c => !/DELETE|UPDATE dbo.SaldosVacaciones/.test(c.query))).toBeTruthy();
  });
}
for (const caso of [{
  nombre: "inexistente",
  etapa: 1,
  status: 404
}, {
  nombre: "desaparece al bloquear",
  etapa: 2,
  status: 404
}, {
  nombre: "otro restaurante",
  etapa: 3,
  status: 403
}, {
  nombre: "RH ya resolvió",
  etapa: 4,
  rh: 9,
  status: 409
}, {
  nombre: "aprobada con cálculo",
  etapa: 4,
  rol: "RECURSOS_HUMANOS",
  estado: "APROBADA",
  rh: 9,
  status: 409
}, {
  nombre: "cálculos existentes",
  etapa: 5,
  status: 409
}, {
  nombre: "otras vacaciones superpuestas",
  etapa: 6,
  status: 409
}, {
  nombre: "conflicto al actualizar",
  etapa: 7,
  status: 409
}, {
  nombre: "fallo de bitácora",
  etapa: 8,
  status: 500
}]) {
  test(`reversión rechaza ${caso.nombre} y revierte sin modificar cálculos ni saldo`, async () => {
    identity = {
      Rol: caso.rol ?? "GERENTE"
    };
    const anterior = {
      ...solicitud,
      Estado: caso.estado ?? "RECHAZADA",
      RevisadoPorGerenteId: 8,
      RevisadoPorRhId: caso.rh ?? null
    };
    respond(/FROM dbo.Solicitudes AS s/, caso.etapa === 1 ? [] : [anterior]);
    if (caso.etapa >= 2) {
      respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
        ColaboradorId: 4
      }]);
      respond(/FROM dbo.Solicitudes AS s/, caso.etapa === 2 ? [] : [anterior]);
    }
    if (caso.etapa >= 3 && identity.Rol === "GERENTE") respond(/FROM Usuarios/, [{
      RestauranteId: caso.etapa === 3 ? 99 : 2
    }]);
    if (caso.etapa >= 5) respond(/FROM dbo.CalculosVacaciones/, caso.etapa === 5 ? [{
      CalculoVacacionId: 1
    }] : []);
    if (caso.etapa >= 6) respond(/FROM dbo.Vacaciones/, caso.etapa === 6 ? [{
      SolicitudId: 99
    }] : []);
    if (caso.etapa >= 7) respond(/UPDATE dbo.Solicitudes/, caso.etapa === 7 ? [] : [{
      Estado: "PENDIENTE"
    }]);
    if (caso.etapa === 8) respond(/INSERT INTO dbo.Bitacora/, [], new Error("Fallo de bitácora"));
    const response = await request("PATCH", "/31/revertir", {
      motivo: "Corregir revisión"
    });
    expect(response.status).toBe(caso.status);
    expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
    expect(calls.every(c => !/DELETE|UPDATE dbo.SaldosVacaciones/.test(c.query))).toBeTruthy();
  });
}
test("reversión exige motivo e ID válidos antes de iniciar una transacción", async () => {
  identity = {
    Rol: "GERENTE"
  };
  expect((await request("PATCH", "/31/revertir", {})).status).toBe(400);
  expect((await request("PATCH", "/abc/revertir", {
    motivo: "Corregir"
  })).status).toBe(400);
  expect(calls.length).toBe(0);
  expect(eventos.length).toBe(0);
});
test("RH no aprueba vacaciones que ahora coinciden con otras aprobadas", async () => {
  identity = {
    Rol: "RECURSOS_HUMANOS"
  };
  const anterior = {
    ...solicitud,
    Estado: "EN_REVISION_RH"
  };
  const otra = {
    ...solicitud,
    SolicitudId: 99,
    Estado: "APROBADA"
  };
  respond(/FROM dbo.Solicitudes AS s/, [anterior]);
  respond(/FROM dbo.Vacaciones/, [otra]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
    ColaboradorId: 4
  }]);
  respond(/FROM dbo.Vacaciones/, [otra]);
  expect((await request("PATCH", "/31/resolver-rh", {
    estado: "APROBADA"
  })).status).toBe(409);
  expect(calls.every(c => !/\b(INSERT|UPDATE|DELETE)\b/.test(c.query))).toBeTruthy();
  expect(eventos.map(e => e.operacion)).toEqual(["begin", "rollback"]);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
