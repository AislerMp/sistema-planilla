import assert from "node:assert/strict";
import { test, beforeEach, afterEach, mock } from "node:test";
import { hash } from "bcrypt";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const puestos = await import("../src/modules/puestos/puestos.service.js");
const restaurantes = await import("../src/modules/restaurantes/restaurantes.service.js");
const colaboradores = await import("../src/modules/colaboradores/colaboradores.service.js");
const auth = await import("../src/modules/auth/auth.service.js");

let expected;
let events;
let activeTransaction;
let commitError;
let rollbackError;

function request(transaction) {
  const parameters = {};
  return {
    input(name, type, value) { parameters[name] = value; return this; },
    async query(query) {
      const next = expected.shift();
      assert.ok(next, `Consulta inesperada: ${query}`);
      assert.match(query, next.pattern);
      assert.equal(transaction, next.transactional === false ? undefined : activeTransaction);
      assert.ok(next.transactional === false || activeTransaction, "Se requiere una transacción iniciada");
      events.push({ type: "query", query, parameters });
      if (next.error) throw next.error;
      return { recordset: next.records ?? [], rowsAffected: [next.affected ?? 1] };
    },
  };
}

mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => request());
mock.method(sql.Transaction.prototype, "begin", async function () {
  assert.equal(activeTransaction, undefined, "Una transacción por operación");
  activeTransaction = this;
  events.push({ type: "begin" });
});
mock.method(sql.Transaction.prototype, "request", function () { return request(this); });
mock.method(sql.Transaction.prototype, "commit", async function () {
  assert.equal(this, activeTransaction);
  events.push({ type: "commit" });
  if (commitError) throw commitError;
});
mock.method(sql.Transaction.prototype, "rollback", async function () {
  assert.equal(this, activeTransaction);
  events.push({ type: "rollback" });
  if (rollbackError) throw rollbackError;
});

beforeEach(() => {
  expected = [];
  events = [];
  activeTransaction = undefined;
  commitError = undefined;
  rollbackError = undefined;
});
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));

const puesto = { PuestoId: 7, Nombre: "Cajero", TarifaHora: 1000, Activo: true };

const editUserData = { nombreUsuario: "ana.nueva", rolId: 2, colaboradorId: 12 };
for (const scenario of ["success", "audit", "duplicate", "linked", "inactive"]) {
  test("editar usuario: " + scenario, async () => {
    expected.push({ pattern: /FROM Roles/, transactional: false, records: [{ RolId: 2 }] });
    expected.push({ pattern: /FROM Usuarios WITH/, records: [{
      UsuarioId: 7, NombreUsuario: "ana", RolId: 1, ColaboradorId: 12,
      Activo: scenario !== "inactive", PasswordHash: "never-audit-this",
    }] });
    if (scenario !== "inactive") {
      expected.push({ pattern: /FROM Usuarios WHERE NombreUsuario/, records: scenario === "duplicate" ? [{ UsuarioId: 8 }] : [] });
      if (scenario !== "duplicate") {
        expected.push({ pattern: /FROM Colaboradores/, records: [{ ColaboradorId: 12, Activo: true }] });
        expected.push({ pattern: /FROM Usuarios WHERE ColaboradorId/, records: [{ UsuarioId: scenario === "linked" ? 8 : 7 }] });
        if (scenario !== "linked") {
          expected.push({ pattern: /UPDATE Usuarios SET NombreUsuario/ });
          expected.push({ pattern: /INSERT INTO dbo.Bitacora/, ...(scenario === "audit" ? { error: new Error("audit failed") } : {}) });
        }
      }
    }
    if (scenario === "success") {
      assert.equal(await auth.updateUser(7, editUserData, 3), true);
      const audit = events.at(-2).parameters;
      assert.equal(audit.UsuarioId, 3);
      assert.equal(audit.Accion, "ACTUALIZAR");
      assert.deepEqual(JSON.parse(audit.DatosNuevos), editUserData);
      assert.deepEqual(JSON.parse(audit.DatosAnteriores), { nombreUsuario: "ana", rolId: 1, colaboradorId: 12 });
      assert.equal(events.at(-1).type, "commit");
    } else {
      await assert.rejects(auth.updateUser(7, editUserData, 3), scenario === "audit" ? /audit failed/ : { status: 409 });
      assert.equal(events.at(-1).type, "rollback");
      assert.equal(events.some(event => event.type === "commit"), false);
    }
  });
}

const restaurante = {
  RestauranteId: 7, Nombre: "Centro", DistritoId: null, DetalleDireccion: null, Activo: true,
};
const operations = [
  {
    name: "crear puesto", entity: "Puestos", action: "CREAR",
    run: actor => puestos.createNewPuesto({ nombre: "Cajero", tarifaHora: 1500 }, actor),
    write: /INSERT INTO Puestos/, records: [{ PuestoId: 7 }],
    before: null, after: { nombre: "Cajero", tarifaHora: 1500 },
  },
  {
    name: "cambiar tarifa", entity: "Puestos", action: "CAMBIAR_TARIFA", previous: puesto,
    run: actor => puestos.updateTarifaPuesto(7, null, actor), write: /UPDATE Puestos SET TarifaHora/,
    before: { tarifaHora: 1000 }, after: { tarifaHora: null },
  },
  ...[false, true].map(activo => ({
    name: activo ? "activar puesto" : "desactivar puesto", entity: "Puestos",
    action: activo ? "ACTIVAR" : "DESACTIVAR", previous: { ...puesto, Activo: !activo },
    run: actor => (activo ? puestos.activarPuesto : puestos.desactivarPuesto)(7, actor), write: /UPDATE Puestos SET Activo/,
    before: { activo: !activo }, after: { activo },
  })),
  {
    name: "crear restaurante", entity: "Restaurantes", action: "CREAR",
    run: actor => restaurantes.createNewRestaurante({ nombre: "Norte" }, actor),
    write: /INSERT INTO Restaurantes/, records: [{ RestauranteId: 7 }],
    before: null, after: { nombre: "Norte", distritoId: null, detalleDireccion: null },
  },
  {
    name: "editar restaurante", entity: "Restaurantes", action: "ACTUALIZAR", previous: restaurante,
    run: actor => restaurantes.updateExistingRestaurante(7, { nombre: "Norte" }, actor),
    write: /UPDATE Restaurantes SET Nombre/,
    before: { nombre: "Centro", distritoId: null, detalleDireccion: null },
    after: { nombre: "Norte", distritoId: null, detalleDireccion: null },
  },
  ...[false, true].map(activo => ({
    name: activo ? "activar restaurante" : "desactivar restaurante", entity: "Restaurantes",
    action: activo ? "ACTIVAR" : "DESACTIVAR", previous: { ...restaurante, Activo: !activo },
    run: actor => (activo ? restaurantes.activarRestaurante : restaurantes.desactivarRestaurante)(7, actor), write: /UPDATE Restaurantes SET Activo/,
    before: { activo: !activo }, after: { activo },
  })),
  ...[false, true].map(activo => ({
    name: activo ? "activar colaborador" : "desactivar colaborador", entity: "Colaboradores",
    action: activo ? "ACTIVAR" : "DESACTIVAR", previous: { ColaboradorId: 7, Activo: !activo },
    run: actor => (activo ? colaboradores.activarColaborador : colaboradores.desactivarColaborador)(7, actor),
    write: /UPDATE Colaboradores SET Activo/,
    before: { activo: !activo }, after: { activo },
  })),
  ...[false, true].map(activo => ({
    name: activo ? "activar usuario" : "desactivar usuario", entity: "Usuarios",
    action: activo ? "ACTIVAR" : "DESACTIVAR",
    previous: { UsuarioId: 7, Activo: !activo },
    run: actor => (activo ? auth.activarUsuario : auth.desactivarUsuario)(7, actor),
    write: /UPDATE Usuarios SET Activo/,
    before: { activo: !activo }, after: { activo },
  })),
];

function expectRead(operation, records = [operation.previous]) {
  if (operation.previous) {
    expected.push({
      pattern: operation.entity === "Colaboradores" ? /FROM Colaboradores/
        : new RegExp(`FROM ${operation.entity} WITH \\(UPDLOCK, HOLDLOCK\\)`), records,
    });
  }
}

function expectWrite(operation, overrides = {}) {
  expected.push({ pattern: operation.write, records: operation.records, ...overrides });
}

function expectAudit(overrides = {}) {
  expected.push({ pattern: /INSERT INTO dbo.Bitacora/, ...overrides });
}

for (const operation of operations) {
  test(`${operation.name}: confirma escritura y bitácora en la misma transacción`, async () => {
    expectRead(operation);
    expectWrite(operation);
    expectAudit();
    assert.equal(await operation.run(3), true);
    assert.equal(events[0].type, "begin");
    assert.equal(events.at(-1).type, "commit");
    assert.equal(events.filter(event => event.type === "commit").length, 1);
    assert.equal(events.some(event => event.type === "rollback"), false);
    const audit = events.at(-2).parameters;
    assert.equal(audit.UsuarioId, 3);
    assert.equal(audit.RegistroId, 7);
    assert.equal(audit.Entidad, operation.entity);
    assert.equal(audit.Accion, operation.action);
    assert.deepEqual(JSON.parse(audit.DatosAnteriores), operation.before);
    assert.deepEqual(JSON.parse(audit.DatosNuevos), operation.after);
  });

  for (const failure of ["escritura", "bitácora", "bitácora sin inserción", "commit", "rollback"]) {
    test(`${operation.name}: conserva el error original si falla ${failure}`, async (t) => {
      const error = new Error(`Fallo de ${failure}`);
      expectRead(operation);
      expectWrite(operation, failure === "escritura" ? { error } : {});
      if (failure !== "escritura") {
        expectAudit(failure === "bitácora sin inserción" ? { affected: 0 }
          : ["bitácora", "rollback"].includes(failure) ? { error } : {});
      }
      if (failure === "commit") commitError = error;
      if (failure === "rollback") {
        rollbackError = new Error("Error secundario de rollback");
        t.mock.method(console, "error", () => {});
      }
      await assert.rejects(operation.run(3), failure === "bitácora sin inserción"
        ? { status: 500, message: "No se pudo registrar la bitácora" }
        : received => received === error);
      assert.equal(events.at(-1).type, "rollback");
      assert.equal(events.filter(event => event.type === "commit").length, failure === "commit" ? 1 : 0);
    });
  }

  test(`${operation.name}: rechaza un actor inválido antes de abrir una transacción`, async () => {
    for (const actor of [undefined, null, "", 0, -1, "abc"]) {
      await assert.rejects(operation.run(actor), { status: 400 });
    }
    assert.deepEqual(events, []);
  });

  test(`${operation.name}: revierte cuando la escritura no afecta ningún registro`, async () => {
    expectRead(operation);
    expectWrite(operation, { records: [], affected: 0 });
    await assert.rejects(operation.run(3), { status: operation.previous ? 404 : 500 });
    assert.equal(events.at(-1).type, "rollback");
    assert.equal(events.some(event => event.type === "commit"), false);
  });

  if (operation.previous) {
    test(`${operation.name}: revierte si no existe el registro`, async () => {
      expectRead(operation, []);
      await assert.rejects(operation.run(3), { status: 404 });
      assert.deepEqual(events.map(event => event.type), ["begin", "query", "rollback"]);
    });
  }
}

test("no se modifica la tarifa ni los datos de un registro inactivo", async () => {
  for (const operation of operations.filter(operation => ["CAMBIAR_TARIFA", "ACTUALIZAR"].includes(operation.action))) {
    activeTransaction = undefined;
    events = [];
    expectRead(operation, [{ ...operation.previous, Activo: false }]);
    await assert.rejects(operation.run(3), { status: 409 });
    assert.deepEqual(events.map(event => event.type), ["begin", "query", "rollback"]);
  }
});

test("cambiar contraseña confirma la transacción y no copia hashes a la bitácora", async () => {
  const passwordHash = await hash("actual", 4);
  expected.push({
    pattern: /FROM Usuarios/, transactional: false,
    records: [{ UsuarioId: 3, NombreUsuario: "ana", Activo: true, PasswordHash: passwordHash }],
  });
  expected.push({ pattern: /UPDATE Usuarios SET PasswordHash/ });
  expectAudit();
  assert.equal(await auth.changePassword(3, "actual", "nueva"), true);
  assert.equal(events.at(-1).type, "commit");
  assert.equal(events.some(event => event.type === "rollback"), false);
  const audit = events.at(-2).parameters;
  assert.equal(audit.Accion, "CAMBIAR_CONTRASENA");
  assert.equal(audit.UsuarioId, 3);
  assert.deepEqual(JSON.parse(audit.DatosAnteriores), { nombreUsuario: "ana" });
  assert.deepEqual(JSON.parse(audit.DatosNuevos), { nombreUsuario: "ana", passwordActualizada: true });
});
