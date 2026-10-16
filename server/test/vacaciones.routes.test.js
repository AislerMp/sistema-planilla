import assert from "node:assert/strict";
import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import { once } from "node:events";
import express from "express";
import session from "express-session";

// Requests SQL simulados: se prueban las rutas, controllers y servicios reales.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test", SESSION_SECRET: "solo-tests",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { default: app } = await import("../src/app.js");
const fecha = (texto) => new Date(`${texto}T00:00:00.000Z`);
const solicitud = {
  SolicitudId: 31, TipoSolicitud: "VACACIONES", ColaboradorId: 4,
  RestauranteId: 2, Estado: "PENDIENTE", DiasSolicitados: 14,
  FechaInicio: fecha("2026-10-15"), FechaFin: fecha("2026-10-28"),
};
const saldo = { ColaboradorId: 4, DiasAcumulados: 22, DiasUtilizados: 2, DiasDisponibles: 20 };
const roles = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
const json = (value) => JSON.parse(JSON.stringify(value));
let expected, calls, eventos, identity, server, baseUrl;

function crearRequest(transaction = null) {
  const parametros = {};
  return {
    input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
    async query(query) {
      const respuesta = expected.shift();
      assert.ok(respuesta, `Consulta inesperada: ${query}`);
      assert.match(query, respuesta.pattern);
      calls.push({ query, parametros, transaction });
      if (respuesta.error) throw respuesta.error;
      return { recordset: respuesta.records, rowsAffected: [1] };
    },
  };
}
mock.method(console, "error", () => {});
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => crearRequest());
mock.method(sql.Transaction.prototype, "request", function () { return crearRequest(this); });
for (const operacion of ["begin", "commit", "rollback"]) {
  mock.method(sql.Transaction.prototype, operacion, async function () {
    eventos.push({ operacion, transaction: this });
  });
}

before(async () => {
  const harness = express();
  harness.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  harness.use((req, _res, next) => {
    if (identity) req.session.user = { Activo: true, UsuarioId: 7, ColaboradorId: 4, ...identity };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/vacaciones`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
});
beforeEach(() => { expected = []; calls = []; eventos = []; identity = undefined; });
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));
function respond(pattern, records = [], error) { expected.push({ pattern, records, error }); }
function request(method, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

for (const [method, path, permitidos] of [
  ["GET", "/mis-vacaciones", ["COLABORADOR"]],
  ["GET", "/mi-saldo", ["COLABORADOR"]],
  ["GET", "/saldos/4", ["RECURSOS_HUMANOS", "ADMINISTRADOR"]],
  ["GET", "/restaurante", roles.slice(1)],
  ["GET", "/restaurante/2", roles.slice(1)],
  ["GET", "/31", roles],
  ["POST", "/", ["COLABORADOR"]],
  ["PATCH", "/31/revisar-gerente", ["GERENTE"]],
  ["PATCH", "/31/resolver-rh", ["RECURSOS_HUMANOS"]],
  ["PATCH", "/31/revertir", ["GERENTE", "RECURSOS_HUMANOS"]],
]) {
  test(`${method} ${path} exige sesión y respeta los roles`, async () => {
    assert.equal((await request(method, path)).status, 401);
    for (const Rol of [...roles.filter((rol) => !permitidos.includes(rol)), "DESCONOCIDO"]) {
      identity = { Rol };
      assert.equal((await request(method, path)).status, 403);
    }
    assert.equal(calls.length, 0);
  });
}

test("mis vacaciones devuelve un array y toma el colaborador de la sesión", async () => {
  identity = { Rol: "COLABORADOR" };
  respond(/FROM dbo.Vacaciones/, [solicitud]);
  const response = await request("GET", "/mis-vacaciones?colaboradorId=999&desde=2026-10-01&hasta=2026-10-31&estado=pendiente");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), json([solicitud]));
  assert.equal(calls[0].parametros.colaboradorId, 4);
  assert.equal(calls[0].parametros.estado, "PENDIENTE");
  assert.equal(calls[0].parametros.desde.toISOString(), "2026-10-01T00:00:00.000Z");
  for (const filtro of ["estado=INVALIDO", "desde=2026-02-30", "desde=2026-11-01&hasta=2026-10-01"]) {
    assert.equal((await request("GET", `/mis-vacaciones?${filtro}`)).status, 400);
  }
  respond(/FROM dbo.Vacaciones/);
  assert.deepEqual(await (await request("GET", "/mis-vacaciones")).json(), []);
});

test("detalle limita al propietario y al restaurante vigente del gerente", async () => {
  identity = { Rol: "COLABORADOR" };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  assert.deepEqual(await (await request("GET", "/31")).json(), json(solicitud));
  respond(/FROM dbo.Solicitudes AS s/, [{ ...solicitud, ColaboradorId: 99 }]);
  assert.equal((await request("GET", "/31")).status, 403);
  identity = { Rol: "GERENTE", RestauranteId: 2 };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{ RestauranteId: 3 }]);
  assert.equal((await request("GET", "/31")).status, 403);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
  assert.equal((await request("GET", "/31")).status, 200);
  for (const Rol of roles.slice(2)) {
    identity = { Rol };
    respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
    assert.equal((await request("GET", "/31")).status, 200);
  }
  respond(/FROM dbo.Solicitudes AS s/);
  assert.equal((await request("GET", "/31")).status, 404);
  assert.equal((await request("GET", "/abc")).status, 400);
});

test("gerente consulta solo su restaurante, por ruta, query o sin filtro", async () => {
  identity = { Rol: "GERENTE", RestauranteId: 999 };
  for (const path of ["/restaurante", "/restaurante/2", "/restaurante?restauranteId=2"]) {
    respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
    respond(/FROM dbo.Vacaciones/, [solicitud]);
    const response = await request("GET", path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), json([solicitud]));
    assert.equal(calls.at(-1).parametros.restauranteId, 2);
  }
  respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
  assert.equal((await request("GET", "/restaurante/3")).status, 403);
  respond(/FROM Usuarios/, [{ RestauranteId: null }]);
  assert.equal((await request("GET", "/restaurante")).status, 403);
  assert.equal((await request("GET", "/restaurante?estado=INVALIDO")).status, 400);
});

test("RH y administrador pueden listar todos los restaurantes o filtrar uno", async () => {
  for (const Rol of roles.slice(2)) {
    identity = { Rol };
    for (const path of ["/restaurante", "/restaurante/2", "/restaurante?restauranteId=2"]) {
      respond(/FROM dbo.Vacaciones/, [solicitud]);
      assert.equal((await request("GET", path)).status, 200);
      assert.equal(calls.at(-1).parametros.restauranteId, path === "/restaurante" ? null : 2);
      assert.match(calls.at(-1).query, /@restauranteId IS NULL OR s.RestauranteId = @restauranteId/);
    }
    assert.equal((await request("GET", "/restaurante/abc")).status, 400);
  }
});

test("saldos: el colaborador consulta el suyo; RH y administrador consultan por ID", async () => {
  identity = { Rol: "COLABORADOR" };
  respond(/FROM dbo.SaldosVacaciones/, [saldo]);
  assert.deepEqual(await (await request("GET", "/mi-saldo?colaboradorId=999")).json(), saldo);
  assert.equal(calls.at(-1).parametros.colaboradorId, 4);
  for (const Rol of roles.slice(2)) {
    identity = { Rol };
    respond(/FROM dbo.SaldosVacaciones/, [saldo]);
    assert.deepEqual(await (await request("GET", "/saldos/4")).json(), saldo);
    assert.equal(calls.at(-1).parametros.colaboradorId, 4);
  }
  respond(/FROM dbo.SaldosVacaciones/);
  assert.equal((await request("GET", "/saldos/99")).status, 404);
  assert.equal((await request("GET", "/saldos/abc")).status, 400);
});

test("POST crea con JSON y usa la identidad y restaurante reales", async () => {
  identity = { Rol: "COLABORADOR" };
  respond(/FROM Colaboradores/, [{ ColaboradorId: 4, RestauranteId: 2 }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
  respond(/FROM dbo.Vacaciones/);
  respond(/FROM dbo.SaldosVacaciones/, [saldo]);
  respond(/INSERT INTO dbo.Solicitudes/, [{ SolicitudId: 31 }]);
  respond(/INSERT INTO dbo.Vacaciones/, [solicitud]);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/INSERT INTO dbo.Bitacora/);
  const response = await request("POST", "/", {
    fechaInicio: "2026-10-15", fechaFin: "2026-10-28", motivo: " Descanso ",
    colaboradorId: 999, restauranteId: 999, registradoPorUsuarioId: 999,
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), json(solicitud));
  const cabecera = calls.find((c) => c.query.includes("INSERT INTO dbo.Solicitudes"));
  assert.equal(cabecera.parametros.colaboradorId, 4);
  assert.equal(cabecera.parametros.restauranteId, 2);
  assert.equal(cabecera.parametros.registradoPorUsuarioId, 7);
  assert.equal(calls.find((c) => c.query.includes("INSERT INTO dbo.Vacaciones")).parametros.diasSolicitados, 14);
  assert.equal(calls.at(-1).parametros.Entidad, "Vacaciones");
  assert.deepEqual(eventos.map((e) => e.operacion), ["begin", "commit"]);
});

for (const gerente of [true, false]) {
  test(`PATCH ${gerente ? "gerente" : "RH"} usa el revisor de la sesión y registra bitácora`, async () => {
    identity = { Rol: gerente ? "GERENTE" : "RECURSOS_HUMANOS" };
    const anterior = { ...solicitud, Estado: gerente ? "PENDIENTE" : "EN_REVISION_RH" };
    const estado = gerente ? "EN_REVISION_RH" : "RECHAZADA";
    const campo = gerente ? "revisadoPorGerenteId" : "revisadoPorRhId";
    const nueva = { ...anterior, Estado: estado };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (gerente) {
      respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
      respond(/FROM dbo.Solicitudes AS s/, [anterior]);
      respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
    } else respond(/FROM dbo.Vacaciones/, [anterior]);
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: estado.toLowerCase(), observacion: " Revisada ", [campo]: 999,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), json(gerente ? nueva : { vacacionActualizada: nueva, registroCalculoCreado: null }));
    assert.equal(calls.at(-2).parametros[campo], 7);
    assert.equal(calls.at(-2).parametros.observacion, "Revisada");
    assert.equal(calls.at(-1).parametros.UsuarioId, 7);
    assert.deepEqual(eventos.map((e) => e.operacion), ["begin", "commit"]);
    assert.equal((await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, { estado: "INVALIDO" })).status, 400);
  });
}

for (const fallaSegundo of [false, true]) {
  test(`aprobar por HTTP ${fallaSegundo ? "revierte si falla el segundo cálculo" : "devuelve los dos cálculos y confirma la bitácora"}`, async () => {
    identity = { Rol: "RECURSOS_HUMANOS" };
    const aprobada = { ...solicitud, Estado: "APROBADA" };
    const calculos = [
      { CalculoVacacionId: 1, SolicitudId: 31, PeriodoId: 3, DiasReconocidos: 4, MinutosReconocidos: 1920 },
      { CalculoVacacionId: 2, SolicitudId: 31, PeriodoId: 9, DiasReconocidos: 10, MinutosReconocidos: 4800 },
    ];
    respond(/FROM dbo.Solicitudes AS s/, [{ ...solicitud, Estado: "EN_REVISION_RH" }]);
    respond(/FROM dbo.Vacaciones/);
    respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
    respond(/FROM dbo.Vacaciones/);
    respond(/FROM dbo.SaldosVacaciones/, [saldo]);
    respond(/UPDATE dbo.Solicitudes/, [aprobada]);
    respond(/FROM dbo.CalculosVacaciones/);
    respond(/FROM dbo.Solicitudes AS s/, [aprobada]);
    respond(/FROM dbo.PeriodosPlanilla/, [{ PeriodoId: 3, FechaFin: fecha("2026-10-18"), Estado: "ABIERTO" }]);
    respond(/FROM dbo.PeriodosPlanilla/, [{ PeriodoId: 9, FechaFin: fecha("2026-11-01"), Estado: "PROGRAMADO" }]);
    respond(/INSERT INTO dbo.CalculosVacaciones/, [calculos[0]]);
    respond(/INSERT INTO dbo.CalculosVacaciones/, fallaSegundo ? [] : [calculos[1]]);
    if (!fallaSegundo) respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", "/31/resolver-rh", { estado: "APROBADA" });
    assert.equal(response.status, fallaSegundo ? 500 : 200);
    assert.deepEqual(eventos.map((e) => e.operacion), ["begin", fallaSegundo ? "rollback" : "commit"]);
    assert.ok(calls.every((c) => c.transaction === eventos[0].transaction));
    if (!fallaSegundo) {
      assert.deepEqual(await response.json(), json({ vacacionActualizada: aprobada, registroCalculoCreado: calculos }));
      assert.equal(calls.at(-1).parametros.Accion, "APROBAR_VACACIONES");
    }
  });
}

for (const caso of [
  { rol: "GERENTE", estado: "EN_REVISION_RH", rh: null, destino: "PENDIENTE" },
  { rol: "GERENTE", estado: "RECHAZADA", rh: null, destino: "PENDIENTE" },
  { rol: "RECURSOS_HUMANOS", estado: "RECHAZADA", rh: 9, destino: "EN_REVISION_RH" },
]) {
  test(`reversión HTTP ${caso.rol}: ${caso.estado} a ${caso.destino} con motivo y bitácora`, async () => {
    identity = { Rol: caso.rol };
    const anterior = { ...solicitud, Estado: caso.estado, RevisadoPorGerenteId: 8, RevisadoPorRhId: caso.rh };
    const nueva = { ...anterior, Estado: caso.destino, RevisadoPorGerenteId: caso.destino === "PENDIENTE" ? null : 8, RevisadoPorRhId: null, Observacion: null };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (caso.rol === "GERENTE") respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
    respond(/FROM dbo.CalculosVacaciones/);
    respond(/FROM dbo.Vacaciones/, caso.estado === "EN_REVISION_RH" ? [anterior] : []);
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", "/31/revertir", { motivo: " Corregir revisión ", usuarioId: 999 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), json(nueva));
    const actualizacion = calls.find((c) => c.query.includes("UPDATE dbo.Solicitudes"));
    assert.equal(actualizacion.parametros.estadoDestino, caso.destino);
    assert.match(actualizacion.query, /AND Estado = @estadoActual/);
    const auditoria = calls.at(-1).parametros;
    assert.equal(auditoria.UsuarioId, 7);
    assert.equal(auditoria.Entidad, "Vacaciones");
    assert.equal(auditoria.Accion, "REVERTIR");
    assert.deepEqual(JSON.parse(auditoria.DatosAnteriores), json(anterior));
    assert.deepEqual(JSON.parse(auditoria.DatosNuevos), json({ ...nueva, motivoReversion: "Corregir revisión" }));
    assert.deepEqual(eventos.map((e) => e.operacion), ["begin", "commit"]);
    assert.ok(calls.filter((c) => !c.query.includes("FROM Usuarios")).every((c) => c.transaction === eventos[0].transaction));
    assert.ok(calls.every((c) => !/DELETE|UPDATE dbo.SaldosVacaciones/.test(c.query)));
  });
}

for (const caso of [
  { nombre: "inexistente", etapa: 1, status: 404 },
  { nombre: "desaparece al bloquear", etapa: 2, status: 404 },
  { nombre: "otro restaurante", etapa: 3, status: 403 },
  { nombre: "RH ya resolvió", etapa: 4, rh: 9, status: 409 },
  { nombre: "aprobada con cálculo", etapa: 4, rol: "RECURSOS_HUMANOS", estado: "APROBADA", rh: 9, status: 409 },
  { nombre: "cálculos existentes", etapa: 5, status: 409 },
  { nombre: "otras vacaciones superpuestas", etapa: 6, status: 409 },
  { nombre: "conflicto al actualizar", etapa: 7, status: 409 },
  { nombre: "fallo de bitácora", etapa: 8, status: 500 },
]) {
  test(`reversión rechaza ${caso.nombre} y revierte sin modificar cálculos ni saldo`, async () => {
    identity = { Rol: caso.rol ?? "GERENTE" };
    const anterior = { ...solicitud, Estado: caso.estado ?? "RECHAZADA", RevisadoPorGerenteId: 8, RevisadoPorRhId: caso.rh ?? null };
    respond(/FROM dbo.Solicitudes AS s/, caso.etapa === 1 ? [] : [anterior]);
    if (caso.etapa >= 2) {
      respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
      respond(/FROM dbo.Solicitudes AS s/, caso.etapa === 2 ? [] : [anterior]);
    }
    if (caso.etapa >= 3 && identity.Rol === "GERENTE") respond(/FROM Usuarios/, [{ RestauranteId: caso.etapa === 3 ? 99 : 2 }]);
    if (caso.etapa >= 5) respond(/FROM dbo.CalculosVacaciones/, caso.etapa === 5 ? [{ CalculoVacacionId: 1 }] : []);
    if (caso.etapa >= 6) respond(/FROM dbo.Vacaciones/, caso.etapa === 6 ? [{ SolicitudId: 99 }] : []);
    if (caso.etapa >= 7) respond(/UPDATE dbo.Solicitudes/, caso.etapa === 7 ? [] : [{ Estado: "PENDIENTE" }]);
    if (caso.etapa === 8) respond(/INSERT INTO dbo.Bitacora/, [], new Error("Fallo de bitácora"));
    const response = await request("PATCH", "/31/revertir", { motivo: "Corregir revisión" });
    assert.equal(response.status, caso.status);
    assert.deepEqual(eventos.map((e) => e.operacion), ["begin", "rollback"]);
    assert.ok(calls.every((c) => !/DELETE|UPDATE dbo.SaldosVacaciones/.test(c.query)));
  });
}

test("reversión exige motivo e ID válidos antes de iniciar una transacción", async () => {
  identity = { Rol: "GERENTE" };
  assert.equal((await request("PATCH", "/31/revertir", {})).status, 400);
  assert.equal((await request("PATCH", "/abc/revertir", { motivo: "Corregir" })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal(eventos.length, 0);
});

test("RH no aprueba vacaciones que ahora coinciden con otras aprobadas", async () => {
  identity = { Rol: "RECURSOS_HUMANOS" };
  const anterior = { ...solicitud, Estado: "EN_REVISION_RH" };
  const otra = { ...solicitud, SolicitudId: 99, Estado: "APROBADA" };
  respond(/FROM dbo.Solicitudes AS s/, [anterior]);
  respond(/FROM dbo.Vacaciones/, [otra]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
  respond(/FROM dbo.Vacaciones/, [otra]);
  assert.equal((await request("PATCH", "/31/resolver-rh", { estado: "APROBADA" })).status, 409);
  assert.ok(calls.every((c) => !/\b(INSERT|UPDATE|DELETE)\b/.test(c.query)));
  assert.deepEqual(eventos.map((e) => e.operacion), ["begin", "rollback"]);
});
