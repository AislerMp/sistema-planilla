import assert from "node:assert/strict";
import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import { once } from "node:events";
import express from "express";
import session from "express-session";
import { hash } from "bcrypt";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
  SESSION_SECRET: "secreto-ficticio-exclusivo-de-tests",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { default: app } = await import("../src/app.js");

let expected;
let identity;
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
      next.check?.(parameters);
      if (next.error) throw next.error;
      return { recordset: next.records ?? [], rowsAffected: [1] };
    },
  };
});

before(async () => {
  const harness = express();
  // Identidad controlada por la prueba, nunca por headers o el body del cliente.
  harness.use(session({
    name: "sid", secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false,
  }));
  harness.use((req, res, next) => {
    // Las sesiones reales incluyen Activo; cada prueba puede sobrescribirlo.
    if (identity) req.session.user = { Activo: true, ...identity };
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
beforeEach(() => { expected = []; identity = undefined; });
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("POST /api/auth/login es público y conserva validación y respuesta sin hash", async () => {
  assert.equal((await request("POST", "/api/auth/login", {})).status, 400);
  const user = { UsuarioId: 7, NombreUsuario: "ana", RolId: 1, Rol: "ADMINISTRADOR", ColaboradorId: 12, Activo: true };
  expected.push({
    pattern: /FROM Usuarios WHERE NombreUsuario/,
    records: [{ ...user, PasswordHash: await hash("clave", 4) }],
  });
  expected.push({ pattern: /FROM Roles WHERE RolId/, records: [{ RolId: 1, Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } });
  const result = await request("POST", "/api/auth/login", { nombreUsuario: "ana", password: "clave" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.user, user);
});

test("las rutas privadas rechazan solicitudes anónimas aunque el body declare un administrador", async () => {
  for (const [method, path] of [
    ["POST", "/register"], ["GET", "/users"], ["GET", "/users/7"], ["PATCH", "/change-password"],
  ]) {
    const result = await request(method, `/api/auth${path}`, method === "GET" ? undefined : {
      user: { UsuarioId: 3, rol: "ADMINISTRADOR" }, usuarioActorId: 3,
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.message, "Debés iniciar sesión.");
  }
});

test("una sesión inactiva o sin estado válido no permite consultar ni modificar datos", async () => {
  for (const Activo of [false, 0, null, undefined]) {
    identity = { UsuarioId: 7, Rol: "ADMINISTRADOR", Activo };
    for (const [method, path] of [
      ["GET", "/api/auth/users"],
      ["GET", "/api/colaboradores"],
      ["POST", "/api/auth/register"],
      ["DELETE", "/api/colaboradores/7"],
    ]) {
      const result = await request(method, path);
      assert.equal(result.status, 401);
      assert.equal(result.body.message, "El usuario actual está BLOQUEADO");
    }
  }
});

test("usuarios sin rol administrador pueden consultar cuentas pero no registrarlas", async () => {
  for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "colaborador", "gerente", "recursosHumanos"]) {
    identity = { UsuarioId: 7, Rol: rol };
    const result = await request("POST", "/api/auth/register");
    assert.equal(result.status, 403);
    assert.equal(result.body.message, "No tenés permiso para esta acción.");
    for (const [method, path] of [
      ["POST", "/api/auth/users/activate/8"],
      ["PUT", "/api/auth/users/8"],
      ["DELETE", "/api/auth/users/8"],
    ]) {
      const denied = await request(method, path);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.message, "No tenés permiso para esta acción.");
    }
    const user = { UsuarioId: 7, NombreUsuario: "ana", RolId: 1, Rol: "ADMINISTRADOR", Activo: true };
    expected.push({ pattern: /FROM Usuarios$/, records: [user] });
    expected.push({ pattern: /FROM Roles WHERE RolId/, records: [{ Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } });
    assert.deepEqual(await request("GET", "/api/auth/users"), { status: 200, body: [user] });
    expected.push({ pattern: /FROM Usuarios WHERE UsuarioId/, records: [user], parameters: { id: 7 } });
    expected.push({ pattern: /FROM Roles WHERE RolId/, records: [{ Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } });
    assert.deepEqual(await request("GET", "/api/auth/users/7"), { status: 200, body: user });
  }
});

test("un administrador puede listar y consultar usuarios y acceder al registro", async () => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  const user = { UsuarioId: 7, NombreUsuario: "ana", RolId: 1, Rol: "ADMINISTRADOR", Activo: true };
  expected.push({ pattern: /FROM Usuarios$/, records: [user] });
  expected.push({ pattern: /FROM Roles WHERE RolId/, records: [{ Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } });
    assert.deepEqual(await request("GET", "/api/auth/users"), { status: 200, body: [user] });
  expected.push({ pattern: /FROM Usuarios WHERE UsuarioId/, records: [user], parameters: { id: 7 } });
  expected.push({ pattern: /FROM Roles WHERE RolId/, records: [{ Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } });
    assert.deepEqual(await request("GET", "/api/auth/users/7"), { status: 200, body: user });
  const invalid = await request("GET", "/api/auth/users/abc");
  assert.equal(invalid.status, 400);
  const registration = await request("POST", "/api/auth/register", {});
  assert.equal(registration.status, 400);
  assert.match(registration.body.message, /Nombre de usuario/);
});

test("cambiar contraseña utiliza la identidad autenticada aunque se envíe otro ID", async () => {
  identity = { UsuarioId: 7, Rol: "COLABORADOR" };
  expected.push({ pattern: /FROM Usuarios WHERE UsuarioId/, records: [], parameters: { id: 7 } });
  const result = await request("PATCH", "/api/auth/change-password", {
    currentPassword: "actual", newPassword: "nueva", UsuarioId: 99, id: 99,
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.message, "Usuario no encontrado");
});

test("los errores de auth alcanzan el middleware global y health sigue disponible", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  expected.push({ pattern: /FROM Usuarios/, error: new Error("Detalle SQL privado") });
  const result = await request("POST", "/api/auth/login", { nombreUsuario: "ana", password: "clave" });
  assert.deepEqual(result, { status: 500, body: { message: "No fue posible procesar la solicitud" } });
  assert.equal(logger.mock.callCount(), 1);
  assert.equal((await request("GET", "/api/health")).status, 200);
});

test("crear colaboradores exige autenticación y rechaza todos los roles no administradores", async () => {
  const body = { usuarioActorId: 3, rol: "ADMINISTRADOR" };
  assert.equal((await request("POST", "/api/colaboradores", body)).status, 401);
  for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "colaborador", "gerente", "recursosHumanos", undefined]) {
    identity = { UsuarioId: 7, Rol: rol };
    const result = await request("POST", "/api/colaboradores", body);
    assert.equal(result.status, 403);
    assert.equal(result.body.message, "No tenés permiso para esta acción.");
  }
});

test("un administrador puede crear colaboradores y la bitácora usa su identidad", async (t) => {
  identity = { UsuarioId: 3, Rol: "ADMINISTRADOR" };
  t.mock.method(sql.Transaction.prototype, "begin", async () => {});
  t.mock.method(sql.Transaction.prototype, "request", () => pool.request());
  const commit = t.mock.method(sql.Transaction.prototype, "commit", async () => {});
  const rollback = t.mock.method(sql.Transaction.prototype, "rollback", async () => {});
  expected.push(
    { pattern: /FROM Restaurantes/, records: [{ RestauranteId: 1, Activo: true }] },
    { pattern: /FROM Puestos/, records: [{ PuestoId: 2, Activo: true }] },
    { pattern: /INSERT INTO Colaboradores/, records: [{ ColaboradorId: 12 }] },
    {
      pattern: /INSERT INTO dbo.Bitacora/,
      check: parameters => {
        assert.equal(parameters.UsuarioId, 3);
        assert.equal(parameters.RegistroId, 12);
        assert.equal(parameters.Entidad, "Colaboradores");
        assert.equal(parameters.Accion, "CREAR");
      },
    },
  );
  const result = await request("POST", "/api/colaboradores", {
    identificacion: "123456789", correo: "ana@example.com", nombre: "Ana", apellido: "Mora",
    fechaIngreso: "2026-01-10", restauranteId: 1, puestoId: 2, usuarioActorId: 99,
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.id, 12);
  assert.equal(commit.mock.callCount(), 1);
  assert.equal(rollback.mock.callCount(), 0);
});


test("la cookie del login permite acceder y una cookie alterada se rechaza", async () => {
  // Este servidor usa directamente app.js, sin inyectar ninguna identidad.
  const cookieServer = app.listen(0, "127.0.0.1");
  try {
    await once(cookieServer, "listening");
    const url = `http://127.0.0.1:${cookieServer.address().port}`;
    expected.push(
      { pattern: /FROM Usuarios WHERE NombreUsuario/, records: [{
        UsuarioId: 7, NombreUsuario: "ana", RolId: 1, Activo: true,
        PasswordHash: await hash("clave", 4),
      }] },
      { pattern: /FROM Roles WHERE RolId/, records: [{ Codigo: "ADMINISTRADOR" }], parameters: { id: 1 } },
    );
    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ nombreUsuario: "ana", password: "clave" }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get("access-control-allow-credentials"), "true");
    const cookieHeader = login.headers.get("set-cookie");
    assert.match(cookieHeader, /^sid=/);
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Lax/i);
    const payload = await login.json();
    assert.equal(payload.user.Rol, "ADMINISTRADOR");
    assert.equal("PasswordHash" in payload.user, false);
    const cookie = cookieHeader.split(";")[0];
    expected.push({ pattern: /FROM Roles$/, records: [{ RolId: 1, Codigo: "ADMINISTRADOR" }] });
    const allowed = await fetch(`${url}/api/roles`, { headers: { Cookie: cookie } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), [{ RolId: 1, Codigo: "ADMINISTRADOR" }]);
    for (const headers of [{}, { Cookie: cookie + "alterada" }]) {
      const denied = await fetch(`${url}/api/roles`, { headers });
      assert.equal(denied.status, 401);
      await denied.json();
    }
  } finally {
    await new Promise((resolve, reject) => cookieServer.close(error => error ? reject(error) : resolve()));
  }
});
