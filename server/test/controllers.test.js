import assert from "node:assert/strict";
import { test, beforeEach, afterEach, mock } from "node:test";
import express from "express";
import { once } from "node:events";
import { hash } from "bcrypt";
import { errorHandler } from "../src/middlewares/error.middleware.js";

// Se ejecutan controladores y servicios reales, pero no se conecta a SQL Server.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/config/database.js");
const auth = await import("../src/controllers/authController.js");
const colaboradores = await import("../src/controllers/colaboradoresController.js");
const puestos = await import("../src/controllers/puestosController.js");
const restaurantes = await import("../src/controllers/restaurantesController.js");
const roles = await import("../src/controllers/rolesController.js");
const ubicaciones = await import("../src/controllers/ubicacionesController.js");

let expected;
let calls;
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => {
  const parameters = {};
  return {
    input(name, type, value) {
      parameters[name] = value;
      return this;
    },
    async query(query) {
      const response = expected.shift();
      assert.ok(response, `Consulta inesperada: ${query}`);
      assert.match(query, response.pattern);
      calls.push({ query, parameters });
      if (response.error) throw response.error;
      return { recordset: response.records, rowsAffected: [response.affected] };
    },
  };
});
mock.method(sql.Transaction.prototype, "begin", async () => {});
mock.method(sql.Transaction.prototype, "commit", async () => {});
mock.method(sql.Transaction.prototype, "rollback", async () => {});
mock.method(sql.Transaction.prototype, "request", () => pool.request());
beforeEach(() => { expected = []; calls = []; });
afterEach(() => assert.equal(expected.length, 0, "Faltaron consultas esperadas"));

function respond(pattern, records = [], affected = 1) {
  expected.push({ pattern, records, affected });
}

async function invoke(controller, req = {}) {
  const result = {};
  const app = express();
  app.use(express.json());
  app.post("/", (request, response, next) => {
    request.session = {};
    request.params = req.params ?? {};
    request.user = Object.hasOwn(req, "user") ? req.user : { UsuarioId: 3 };
    return controller(request, response, next);
  });
  app.use((error, request, response, next) => {
    result.error = error;
    next(error);
  });
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    result.status = response.status;
    result.body = await response.json();
    return result;
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const lists = [
  [auth.getUsersController, "Usuarios"],
  [colaboradores.getColaboradoresController, "Colaboradores"],
  [puestos.getPuestosController, "Puestos"],
  [restaurantes.getRestaurantesController, "Restaurantes"],
  [roles.getRolesController, "Roles"],
  [ubicaciones.getProvinciasController, "Provincias"],
];
const details = [
  [colaboradores.getColaboradorByIdController, "Colaboradores"],
  [puestos.getPuestoController, "Puestos"],
  [restaurantes.getRestauranteController, "Restaurantes"],
  [roles.getRolController, "Roles"],
  [ubicaciones.getProvinciaController, "Provincias"],
  [ubicaciones.getCantonController, "Cantones"],
  [ubicaciones.getDistritoController, "Distritos"],
];
const accionesEstado = [
  [colaboradores.activarColaboradorController, "Colaboradores", true],
  [colaboradores.desactivarColaboradorController, "Colaboradores", false],
  [puestos.activarPuestoController, "Puestos", true],
  [puestos.desactivarPuestoController, "Puestos", false],
  [restaurantes.activarRestauranteController, "Restaurantes", true],
  [restaurantes.desactivarRestauranteController, "Restaurantes", false],
];

test("las listas responden 200, incluso cuando están vacías", async () => {
  for (const [controller, table] of lists) {
    for (const records of [[], [table === "Usuarios" ? { NombreUsuario: "ana", RolId: 1, Rol: "ADMINISTRADOR" } : { Nombre: "Ejemplo" }]]) {
      respond(new RegExp(`FROM ${table}`), records);
      if (table === "Usuarios" && records.length) respond(/FROM Roles/, [{ Codigo: "ADMINISTRADOR" }]);
      const result = await invoke(controller);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, records);
    }
  }
});

test("las consultas individuales distinguen éxito, ID inválido y registro ausente", async () => {
  for (const [controller, table] of details) {
    respond(new RegExp(`FROM ${table}`), [{ Nombre: "Ejemplo" }]);
    const result = await invoke(controller, { params: { id: "7" } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { Nombre: "Ejemplo" });
    assert.equal(calls.at(-1).parameters.id, 7);

    const invalid = await invoke(controller, { params: { id: "abc" } });
    assert.equal(invalid.status, 400);
    assert.equal(typeof invalid.body.message, "string");

    respond(new RegExp(`FROM ${table}`));
    const missing = await invoke(controller, { params: { id: "99" } });
    assert.equal(missing.status, 404);
  }
});

test("los errores internos de cada controlador se entregan al middleware", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  for (const [controller, table] of lists) {
    const error = new Error("Detalle privado de SQL");
    expected.push({ pattern: new RegExp(`FROM ${table}`), error });
    const result = await invoke(controller);
    assert.equal(result.error, error);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { message: "No fue posible procesar la solicitud" });
  }
  assert.equal(logger.mock.callCount(), lists.length);
});

test("activar y desactivar fijan su estado sin necesitar ni leer el body", async () => {
  for (const [controller, table, activo] of accionesEstado) {
    for (const body of [undefined, {}, { activo: !activo }, { activo: "false" }, { activo: null }]) {
      respond(new RegExp(`FROM ${table}`), [{ Activo: !activo }]);
      respond(new RegExp(`UPDATE ${table} SET Activo`));
      respond(/INSERT INTO dbo.Bitacora/);
      const result = await invoke(controller, { params: { id: "7" }, body });
      assert.equal(result.status, 200);
      assert.equal(result.body.activo, activo);
      assert.equal(calls.at(-2).parameters.activo, activo);
      assert.equal(calls.at(-1).parameters.UsuarioId, 3);
      assert.equal(calls.at(-1).parameters.Accion, activo ? "ACTIVAR" : "DESACTIVAR");
      assert.deepEqual(JSON.parse(calls.at(-1).parameters.DatosNuevos), { activo });
    }
    respond(new RegExp(`FROM ${table}`), []);
    assert.equal((await invoke(controller, { params: { id: "99" } })).status, 404);
  }
});

test("las bajas desactivan registros sin eliminarlos ni aceptar otro estado del body", async () => {
  for (const [controller, table] of [
    [colaboradores.desactivarColaboradorController, "Colaboradores"],
    [puestos.desactivarPuestoController, "Puestos"],
    [restaurantes.desactivarRestauranteController, "Restaurantes"],
  ]) {
    respond(new RegExp(`FROM ${table}`), [{ Activo: true }]);
    respond(new RegExp(`UPDATE ${table} SET Activo`));
    respond(/INSERT INTO dbo.Bitacora/);
    const result = await invoke(controller, {
      params: { id: "7" }, body: { activo: true }, user: { UsuarioId: 3 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.activo, false);
    assert.equal(calls.find(call => call.query.includes(`UPDATE ${table}`)).parameters.activo, false);
  }
});

test("las creaciones rechazan cuerpos ausentes y anuncian éxito solo si hubo inserción", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [controller, table] of [
    [puestos.createPuestoController, "Puestos"],
    [restaurantes.createRestauranteController, "Restaurantes"],
  ]) {
    assert.equal((await invoke(controller)).status, 400);
    respond(new RegExp(`INSERT INTO ${table}`), [table === "Puestos" ? { PuestoId: 7 } : { RestauranteId: 7 }]);
    respond(/INSERT INTO dbo.Bitacora/);
    assert.equal((await invoke(controller, { body: { nombre: "Centro" } })).status, 201);
    respond(new RegExp(`INSERT INTO ${table}`), [], 0);
    const failed = await invoke(controller, { body: { nombre: "Centro" } });
    assert.ok(failed.error instanceof Error);
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.body, { message: "No fue posible procesar la solicitud" });
  }
});

const colaborador = {
  identificacion: "123456789", correo: "ana@example.com", nombre: "Ana", apellido: "Mora",
  fechaIngreso: "2026-01-10", restauranteId: 1, puestoId: 2,
};
function activeReferences() {
  respond(/FROM Restaurantes/, [{ RestauranteId: 1, Activo: true }]);
  respond(/FROM Puestos/, [{ PuestoId: 2, Activo: true }]);
}

test("crear colaborador devuelve el ID generado y editar usa el ID de la ruta", async () => {
  assert.equal((await invoke(colaboradores.createColaboradorController)).status, 400);
  activeReferences();
  respond(/INSERT INTO Colaboradores/, [{ ColaboradorId: 12 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  const created = await invoke(colaboradores.createColaboradorController, {
    body: colaborador, user: { UsuarioId: 3 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 12);
  activeReferences();
  respond(/FROM Colaboradores/, [{ ColaboradorId: 12, Activo: true }]);
  respond(/UPDATE Colaboradores/);
  respond(/INSERT INTO dbo.Bitacora/);
  const updated = await invoke(colaboradores.updateColaboradorController, {
    params: { id: "12" }, body: { ...colaborador, id: 99 }, user: { UsuarioId: 3 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.actualizado, true);
  assert.equal(calls.find(call => call.query.includes("UPDATE Colaboradores")).parameters.id, 12);
  assert.equal(calls.at(-1).parameters.UsuarioId, 3);
});

test("editar restaurante valida el cuerpo y conserva el conflicto por inactividad", async () => {
  const controller = restaurantes.updateRestauranteController;
  assert.equal((await invoke(controller, { params: { id: "7" } })).status, 400);
  respond(/FROM Restaurantes/, [{ Activo: true }]);
  respond(/UPDATE Restaurantes SET Nombre/);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal((await invoke(controller, { params: { id: "7" }, body: { nombre: "Centro" } })).status, 200);
  respond(/FROM Restaurantes/, [{ Activo: false }]);
  const inactive = await invoke(controller, { params: { id: "7" }, body: { nombre: "Centro" } });
  assert.equal(inactive.status, 409);
  assert.equal(inactive.body.message, "Restaurante está inactivo");
});

test("actualizar tarifa exige el campo, permite null explícito y valida su valor", async () => {
  const controller = puestos.updateTarifaPuestoController;
  for (const body of [undefined, {}, { tarifaHora: -1 }]) {
    assert.equal((await invoke(controller, { params: { id: "7" }, body })).status, 400);
  }
  assert.equal(calls.length, 0);
  for (const tarifaHora of [1500.25, null]) {
    respond(/FROM Puestos/, [{ Activo: true }]);
    respond(/UPDATE Puestos SET TarifaHora/);
    respond(/INSERT INTO dbo.Bitacora/);
    const result = await invoke(controller, { params: { id: "7" }, body: { tarifaHora } });
    assert.equal(result.status, 200);
    assert.equal(calls.at(-2).parameters.TarifaHora, tarifaHora);
  }
});

test("cantones y distritos usan el parámetro del padre y distinguen ausencia de lista vacía", async () => {
  for (const [controller, field, parent, table, parameter] of [
    [ubicaciones.getCantonesController, "provinciaId", "Provincias", "Cantones", "idProvincia"],
    [ubicaciones.getDistritosController, "cantonId", "Cantones", "Distritos", "idCanton"],
  ]) {
    for (const records of [[], [{ Nombre: "Centro" }]]) {
      respond(new RegExp(`FROM ${parent}`), [{ Nombre: "Padre" }]);
      respond(new RegExp(`FROM ${table}`), records);
      const result = await invoke(controller, { params: { [field]: "7", id: "99" } });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, records);
      assert.equal(calls.at(-1).parameters[parameter], 7);
    }
    respond(new RegExp(`FROM ${parent}`));
    assert.equal((await invoke(controller, { params: { [field]: "7" } })).status, 404);
    assert.equal((await invoke(controller, { params: {} })).status, 400);
  }
});

test("auth conserva mensajes de validación, credenciales, ausencia y conflictos", async () => {
  const invalid = await invoke(auth.loginUserController);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.message, "Nombre de usuario es obligatorio y debe tener como máximo 60 caracteres");

  respond(/FROM Usuarios/, []);
  const denied = await invoke(auth.loginUserController, {
    body: { nombreUsuario: "ana", password: "incorrecta" },
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.message, "Credenciales incorrectas");

  respond(/FROM Usuarios/, []);
  const missing = await invoke(auth.getUserController, { params: { id: "7" } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, "Usuario no encontrado");

  respond(/FROM Usuarios/, [{ UsuarioId: 7 }]);
  const duplicate = await invoke(auth.registerUserController, {
    user: { UsuarioId: 3 },
    body: { nombreUsuario: "ana", password: "clave", rolId: 1, colaboradorId: 7 },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.message, "El nombre de usuario ya está en uso");

  const password = await invoke(auth.changePasswordController, {
    user: { UsuarioId: 3 }, body: { currentPassword: "", newPassword: "nueva" },
  });
  assert.equal(password.status, 400);
  assert.equal(password.body.message, "La contraseña es obligatoria");
});

test("login y consulta de usuario conservan las respuestas públicas sin el hash", async () => {
  const user = {
    UsuarioId: 7, NombreUsuario: "ana", RolId: 1, Rol: "ADMINISTRADOR", ColaboradorId: 12, Activo: true,
  };
  const stored = { ...user, PasswordHash: await hash("clave", 4) };
  respond(/FROM Usuarios/, [stored]);
  respond(/FROM Roles/, [{ Codigo: "ADMINISTRADOR" }]);
  const login = await invoke(auth.loginUserController, {
    body: { nombreUsuario: "ana", password: "clave" },
  });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.user, user);
  respond(/FROM Usuarios/, [stored]);
  respond(/FROM Roles/, [{ Codigo: "ADMINISTRADOR" }]);
  const detail = await invoke(auth.getUserController, { params: { id: "7" } });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body, user);
});

test("activar colaborador usa el actor autenticado e ignora el estado del body", async () => {
  respond(/FROM Colaboradores/, [{ ColaboradorId: 7, Activo: false }]);
  respond(/UPDATE Colaboradores SET Activo/);
  respond(/INSERT INTO dbo.Bitacora/);
  const result = await invoke(colaboradores.activarColaboradorController, {
    params: { id: "7" }, user: { UsuarioId: 3 },
    body: { activo: false, usuarioActorId: 99 },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.activo, true);
  assert.equal(calls[1].parameters.activo, true);
  assert.equal(calls[2].parameters.UsuarioId, 3);
});

test("las escrituras de catálogos exigen el actor autenticado e ignoran el enviado en el body", async () => {
  for (const controller of [
    puestos.createPuestoController, puestos.updateTarifaPuestoController, puestos.activarPuestoController, puestos.desactivarPuestoController,
    restaurantes.createRestauranteController, restaurantes.updateRestauranteController,
    restaurantes.activarRestauranteController, restaurantes.desactivarRestauranteController,
  ]) {
    const result = await invoke(controller, {
      params: { id: "7" }, user: undefined,
      body: { nombre: "Centro", tarifaHora: 1500, activo: true, usuarioActorId: 99 },
    });
    assert.equal(result.status, 400);
    assert.match(result.body.message, /usuarioActorId/);
  }
  assert.equal(calls.length, 0);
});
