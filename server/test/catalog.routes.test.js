import assert from "node:assert/strict";
import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import { once } from "node:events";
import express from "express";
import session from "express-session";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
  SESSION_SECRET: "secreto-ficticio-exclusivo-de-tests",
});
const { pool, sql } = await import("../src/config/database.js");
const { default: app } = await import("../src/app.js");

let expected;
let identity;
let calls;
let server;
let baseUrl;
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => {
  const parameters = {};
  return {
    input(name, type, value) { parameters[name] = value; return this; },
    async query(query) {
      const next = expected.shift();
      assert.ok(next, `Consulta inesperada: ${query}`);
      assert.match(query, next.pattern);
      if (next.parameters) assert.deepEqual(parameters, next.parameters);
      calls.push({ query, parameters });
      return { recordset: next.records ?? [], rowsAffected: [1] };
    },
  };
});
mock.method(sql.Transaction.prototype, "begin", async () => {});
mock.method(sql.Transaction.prototype, "request", () => pool.request());
mock.method(sql.Transaction.prototype, "commit", async () => {});
mock.method(sql.Transaction.prototype, "rollback", async () => {});

before(async () => {
  const harness = express();
  harness.use(session({
    name: "sid", secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false,
  }));
  harness.use((req, res, next) => {
    if (identity) req.session.user = identity;
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => { expected = []; calls = []; identity = undefined; });
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.match(response.headers.get("content-type"), /json/, `Ruta no encontrada: ${method} ${path}`);
  return { status: response.status, body: await response.json() };
}

const reads = [
  ["/colaboradores", "Colaboradores"], ["/colaboradores/7", "Colaboradores", "id"],
  ["/puestos", "Puestos"], ["/puestos/7", "Puestos", "id"],
  ["/restaurantes", "Restaurantes"], ["/restaurantes/7", "Restaurantes", "id"],
  ["/roles", "Roles"], ["/roles/7", "Roles", "id"],
  ["/ubicaciones/provincias", "Provincias"], ["/ubicaciones/provincias/7", "Provincias", "id"],
  ["/ubicaciones/cantones/7", "Cantones", "id"], ["/ubicaciones/distritos/7", "Distritos", "id"],
  ["/ubicaciones/provincias/7/cantones", "Cantones", "idProvincia", "Provincias"],
  ["/ubicaciones/cantones/7/distritos", "Distritos", "idCanton", "Cantones"],
];
const writes = [
  ["POST", "/colaboradores"], ["PUT", "/colaboradores/7"],
  ["DELETE", "/colaboradores/7"], ["POST", "/colaboradores/activate/7"],
  ["POST", "/puestos"], ["PATCH", "/puestos/7/tarifa"],
  ["POST", "/puestos/activate/7"], ["DELETE", "/puestos/7"],
  ["POST", "/restaurantes"], ["PUT", "/restaurantes/7"],
  ["POST", "/restaurantes/activate/7"], ["DELETE", "/restaurantes/7"],
];

test("todas las rutas de los módulos requieren autenticación", async () => {
  for (const [method, path] of [...reads.map(([path]) => ["GET", path]), ...writes]) {
    assert.equal((await request(method, path)).status, 401, `${method} ${path}`);
  }
  assert.deepEqual(calls, []);
});

for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
  test(`${rol} puede consultar todos los módulos y los parámetros llegan al servicio`, async () => {
    identity = { UsuarioId: 3, Rol: rol };
    for (const [path, table, parameter, parent] of reads) {
      if (parent) expected.push({ pattern: new RegExp(`FROM ${parent}`), records: [{ Nombre: "Padre" }], parameters: { id: 7 } });
      const row = { Nombre: "Ejemplo" };
      expected.push({ pattern: new RegExp(`FROM ${table}`), records: [row], parameters: parameter ? { [parameter]: 7 } : {} });
      const result = await request("GET", path);
      assert.equal(result.status, 200, path);
      assert.deepEqual(result.body, parameter === "id" ? row : [row]);
    }
  });
}

test("colaborador, gerente y recursos humanos no pueden crear, modificar ni desactivar", async () => {
  for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "colaborador", "gerente", "recursosHumanos"]) {
    identity = { UsuarioId: 3, Rol: rol };
    for (const [method, path] of writes) {
      const result = await request(method, path, { rol: "ADMINISTRADOR", usuarioActorId: 99 });
      assert.equal(result.status, 403, `${rol}: ${method} ${path}`);
    }
  }
  assert.deepEqual(calls, []);
});

test("el administrador alcanza las validaciones de todas las rutas de escritura", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  for (const [method, path] of writes) {
    const invalidPath = path.replace("/7", "/abc");
    assert.equal((await request(method, invalidPath, {})).status, 400, `${method} ${path}`);
  }
  assert.deepEqual(calls, []);
});

test("altas de puestos y restaurantes registran al administrador autenticado", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  for (const [path, table, idField] of [["/puestos", "Puestos", "PuestoId"], ["/restaurantes", "Restaurantes", "RestauranteId"]]) {
    expected.push(
      { pattern: new RegExp(`INSERT INTO ${table}`), records: [{ [idField]: 7 }] },
      { pattern: /INSERT INTO dbo.Bitacora/ },
    );
    const result = await request("POST", path, { nombre: "Centro", usuarioActorId: 99 });
    assert.equal(result.status, 201);
    assert.equal(calls.at(-1).parameters.UsuarioId, 3);
    assert.equal(calls.at(-1).parameters.RegistroId, 7);
  }
});

test("DELETE desactiva los registros e ignora un activo true enviado en el body", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  for (const [path, table] of [["/colaboradores/7", "Colaboradores"], ["/puestos/7", "Puestos"], ["/restaurantes/7", "Restaurantes"]]) {
    expected.push(
      { pattern: new RegExp(`FROM ${table}`), records: [{ Activo: true }] },
      { pattern: new RegExp(`UPDATE ${table} SET Activo`), parameters: { id: 7, activo: false } },
      { pattern: /INSERT INTO dbo.Bitacora/ },
    );
    const result = await request("DELETE", path, { activo: true, usuarioActorId: 99 });
    assert.equal(result.status, 200);
    assert.equal(result.body.activo, false);
    assert.equal(calls.at(-1).parameters.UsuarioId, 3);
    assert.equal(calls.at(-1).parameters.Accion, "DESACTIVAR");
  }
});

test("las rutas de activación fijan true aunque el body indique false", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  for (const [method, path, table, body] of [
    ["POST", "/colaboradores/activate/7", "Colaboradores", { activo: false }],
    ["POST", "/puestos/activate/7", "Puestos", { activo: false }],
    ["POST", "/restaurantes/activate/7", "Restaurantes", { activo: false }],
  ]) {
    expected.push(
      { pattern: new RegExp(`FROM ${table}`), records: [{ Activo: false }] },
      { pattern: new RegExp(`UPDATE ${table} SET Activo`), parameters: { id: 7, activo: true } },
      { pattern: /INSERT INTO dbo.Bitacora/ },
    );
    const result = await request(method, path, body);
    assert.equal(result.status, 200);
    assert.equal(result.body.activo, true);
    assert.equal(calls.at(-1).parameters.Accion, "ACTIVAR");
  }
});

test("las antiguas rutas de estado ya no aceptan cambios desde el body", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  for (const entity of ["puestos", "restaurantes"]) {
    const response = await fetch(`${baseUrl}/api/${entity}/7/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(response.status, 404);
    await response.text();
  }
  assert.deepEqual(calls, []);
});

test("actualizar tarifa y restaurante usa los campos e IDs de sus rutas", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  expected.push(
    { pattern: /FROM Puestos/, records: [{ Activo: true, TarifaHora: 1000 }] },
    { pattern: /UPDATE Puestos SET TarifaHora/, parameters: { id: 7, TarifaHora: 1500 } },
    { pattern: /INSERT INTO dbo.Bitacora/ },
  );
  assert.equal((await request("PATCH", "/puestos/7/tarifa", { tarifaHora: 1500, id: 99 })).status, 200);
  expected.push(
    { pattern: /FROM Restaurantes/, records: [{ Activo: true, Nombre: "Centro", DistritoId: null, DetalleDireccion: null }] },
    { pattern: /UPDATE Restaurantes SET Nombre/, parameters: { id: 7, nombre: "Norte", distritoId: null, detalleDireccion: null } },
    { pattern: /INSERT INTO dbo.Bitacora/ },
  );
  assert.equal((await request("PUT", "/restaurantes/7", { nombre: "Norte", id: 99 })).status, 200);
});
