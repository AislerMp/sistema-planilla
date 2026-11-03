import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
beforeEach(() => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => request());
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async function () {
    assert.equal(activeTransaction, undefined, "Una transacción por operación");
    activeTransaction = this;
    events.push({
      type: "begin"
    });
  });
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    return request(this);
  });
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async function () {
    expect(this).toBe(activeTransaction);
    events.push({
      type: "commit"
    });
    if (commitError) throw commitError;
  });
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async function () {
    expect(this).toBe(activeTransaction);
    events.push({
      type: "rollback"
    });
    if (rollbackError) throw rollbackError;
  });
});
import assert from "node:assert/strict";
import { hash } from "bcrypt";
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
const puestos = await import("../../src/modules/puestos/puestos.service.js");
const restaurantes = await import("../../src/modules/restaurantes/restaurantes.service.js");
const colaboradores = await import("../../src/modules/colaboradores/colaboradores.service.js");
const auth = await import("../../src/modules/auth/auth.service.js");
const permisos = await import("../../src/modules/permisosLaborales/permisosLaborales.service.js");
let expected;
let events;
let activeTransaction;
let commitError;
let rollbackError;
function request(transaction) {
  const parameters = {};
  return {
    input(name, type, value) {
      parameters[name] = value;
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones")) return {
        recordset: []
      };
      if (query.includes("FROM dbo.Colaboradores") && query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
        recordset: [{
          ColaboradorId: 4
        }]
      };
      const next = expected.shift();
      assert.ok(next, `Consulta inesperada: ${query}`);
      expect(query).toMatch(next.pattern);
      expect(transaction).toBe(next.transactional === false ? undefined : activeTransaction);
      assert.ok(next.transactional === false || activeTransaction, "Se requiere una transacción iniciada");
      events.push({
        type: "query",
        query,
        parameters
      });
      if (next.error) throw next.error;
      return {
        recordset: next.records ?? [],
        rowsAffected: [next.affected ?? 1]
      };
    }
  };
}
beforeEach(() => {
  expected = [];
  events = [];
  activeTransaction = undefined;
  commitError = undefined;
  rollbackError = undefined;
});
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));
const puesto = {
  PuestoId: 7,
  Nombre: "Cajero",
  TarifaHora: 1000,
  Activo: true
};
for (const escenario of ["APROBADA", "RECHAZADA", "conflicto", "bitacora"]) {
  test(`resolver permiso laboral: ${escenario}`, async () => {
    const anterior = {
      SolicitudId: 7,
      ColaboradorId: 8,
      RestauranteId: 2,
      FechaSolicitada: new Date("9999-12-31T00:00:00Z"),
      Estado: "PENDIENTE",
      RevisadoPorGerenteId: null,
      Observacion: null
    };
    const estado = escenario === "RECHAZADA" ? escenario : "APROBADA";
    const actualizado = {
      ...anterior,
      Estado: estado,
      RevisadoPorGerenteId: 3,
      Observacion: "Revisado"
    };
    expected.push({
      pattern: /FROM dbo.PermisosLaborales/,
      records: [anterior],
      transactional: false
    });
    expected.push({
      pattern: /FROM Usuarios/,
      records: [{
        RestauranteId: 2
      }],
      transactional: false
    });
    expected.push({
      pattern: /s.TipoSolicitud = 'PERMISO_LABORAL'[\s\S]*s.Estado = 'PENDIENTE'/,
      records: escenario === "conflicto" ? [] : [actualizado]
    });
    const error = new Error("Fallo de bitacora");
    if (escenario !== "conflicto") expected.push({
      pattern: /FROM dbo.PermisosLaborales/,
      records: [actualizado]
    });
    if (escenario !== "conflicto") expected.push({
      pattern: /INSERT INTO dbo.Bitacora/,
      ...(escenario === "bitacora" ? {
        error
      } : {})
    });
    const ejecutar = () => permisos.resolverPermiso("7", {
      estado: estado.toLowerCase(),
      observacion: " Revisado "
    }, {
      UsuarioId: 3,
      Rol: "GERENTE"
    });
    if (["conflicto", "bitacora"].includes(escenario)) {
      await assert.rejects(ejecutar(), escenario === "conflicto" ? {
        status: 409
      } : actual => actual === error);
      expect(events.at(-1).type).toBe("rollback");
      expect(events.some(event => event.type === "commit")).toBe(false);
    } else {
      expect(await ejecutar()).toEqual(actualizado);
      expect(events.at(-1).type).toBe("commit");
      const escritura = events.find(event => event.query?.includes("UPDATE s"));
      expect(escritura.parameters).toEqual({
        solicitudId: 7,
        estado,
        revisadoPorGerenteId: 3,
        observacion: "Revisado"
      });
      const auditoria = events.at(-2).parameters;
      expect(auditoria.Accion).toBe(estado === "APROBADA" ? "APROBAR_PERMISO_LABORAL" : "RECHAZAR_PERMISO_LABORAL");
      expect(JSON.parse(auditoria.DatosAnteriores)).toEqual(JSON.parse(JSON.stringify(anterior)));
      expect(JSON.parse(auditoria.DatosNuevos)).toEqual(JSON.parse(JSON.stringify(actualizado)));
    }
  });
}
test("resolver permiso valida sesión, rol y estado antes de consultar", async () => {
  await assert.rejects(permisos.resolverPermiso(7, {
    estado: "APROBADA"
  }, null), {
    status: 401
  });
  await assert.rejects(permisos.resolverPermiso(7, {
    estado: "APROBADA"
  }, {
    UsuarioId: 3,
    Rol: "COLABORADOR"
  }), {
    status: 403
  });
  for (const estado of ["PENDIENTE", "INVALIDO"]) {
    await assert.rejects(permisos.resolverPermiso(7, {
      estado
    }, {
      UsuarioId: 3,
      Rol: "GERENTE"
    }), {
      status: 400
    });
  }
  expect(events).toEqual([]);
});
for (const caso of ["ausente", "resuelta", "hoy", "vencida", "otro restaurante"]) {
  test(`resolver permiso impide resolver: ${caso}`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-02T18:00:00Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    expected.push({
      pattern: /FROM dbo.PermisosLaborales/,
      transactional: false,
      records: caso === "ausente" ? [] : [{
        SolicitudId: 7,
        RestauranteId: 2,
        Estado: caso === "resuelta" ? "APROBADA" : "PENDIENTE",
        FechaSolicitada: new Date(caso === "hoy" ? "2026-10-02T00:00:00Z" : caso === "vencida" ? "2026-10-01T00:00:00Z" : "2026-10-03T00:00:00Z")
      }]
    });
    if (caso !== "ausente") expected.push({
      pattern: /FROM Usuarios/,
      transactional: false,
      records: [{
        RestauranteId: caso === "otro restaurante" ? 9 : 2
      }]
    });
    await assert.rejects(permisos.resolverPermiso(7, {
      estado: "APROBADA"
    }, {
      UsuarioId: 3,
      Rol: "GERENTE"
    }), {
      status: caso === "ausente" ? 404 : caso === "resuelta" ? 409 : caso === "otro restaurante" ? 403 : 400
    });
    expect(events.some(event => event.type === "begin")).toBe(false);
  });
}
const editUserData = {
  nombreUsuario: "ana.nueva",
  rolId: 2,
  colaboradorId: 12
};
for (const scenario of ["success", "audit", "duplicate", "linked", "inactive"]) {
  test("editar usuario: " + scenario, async () => {
    expected.push({
      pattern: /FROM Roles/,
      transactional: false,
      records: [{
        RolId: 2
      }]
    });
    expected.push({
      pattern: /FROM Usuarios WITH/,
      records: [{
        UsuarioId: 7,
        NombreUsuario: "ana",
        RolId: 1,
        ColaboradorId: 12,
        Activo: scenario !== "inactive",
        PasswordHash: "never-audit-this"
      }]
    });
    if (scenario !== "inactive") {
      expected.push({
        pattern: /FROM Usuarios WHERE NombreUsuario/,
        records: scenario === "duplicate" ? [{
          UsuarioId: 8
        }] : []
      });
      if (scenario !== "duplicate") {
        expected.push({
          pattern: /FROM Colaboradores/,
          records: [{
            ColaboradorId: 12,
            Activo: true
          }]
        });
        expected.push({
          pattern: /FROM Usuarios WHERE ColaboradorId/,
          records: [{
            UsuarioId: scenario === "linked" ? 8 : 7
          }]
        });
        if (scenario !== "linked") {
          expected.push({
            pattern: /UPDATE Usuarios SET NombreUsuario/
          });
          expected.push({
            pattern: /INSERT INTO dbo.Bitacora/,
            ...(scenario === "audit" ? {
              error: new Error("audit failed")
            } : {})
          });
        }
      }
    }
    if (scenario === "success") {
      expect(await auth.updateUser(7, editUserData, 3)).toBe(true);
      const audit = events.at(-2).parameters;
      expect(audit.UsuarioId).toBe(3);
      expect(audit.Accion).toBe("ACTUALIZAR");
      expect(JSON.parse(audit.DatosNuevos)).toEqual(editUserData);
      expect(JSON.parse(audit.DatosAnteriores)).toEqual({
        nombreUsuario: "ana",
        rolId: 1,
        colaboradorId: 12
      });
      expect(events.at(-1).type).toBe("commit");
    } else {
      await assert.rejects(auth.updateUser(7, editUserData, 3), scenario === "audit" ? /audit failed/ : {
        status: 409
      });
      expect(events.at(-1).type).toBe("rollback");
      expect(events.some(event => event.type === "commit")).toBe(false);
    }
  });
}
const restaurante = {
  RestauranteId: 7,
  Nombre: "Centro",
  DistritoId: null,
  DetalleDireccion: null,
  Activo: true
};
const operations = [{
  name: "crear puesto",
  entity: "Puestos",
  action: "CREAR",
  run: actor => puestos.createNewPuesto({
    nombre: "Cajero",
    tarifaHora: 1500
  }, actor),
  write: /INSERT INTO Puestos/,
  records: [{
    PuestoId: 7
  }],
  before: null,
  after: {
    nombre: "Cajero",
    tarifaHora: 1500
  }
}, {
  name: "cambiar tarifa",
  entity: "Puestos",
  action: "CAMBIAR_TARIFA",
  previous: puesto,
  run: actor => puestos.updateTarifaPuesto(7, null, actor),
  write: /UPDATE Puestos SET TarifaHora/,
  before: {
    tarifaHora: 1000
  },
  after: {
    tarifaHora: null
  }
}, ...[false, true].map(activo => ({
  name: activo ? "activar puesto" : "desactivar puesto",
  entity: "Puestos",
  action: activo ? "ACTIVAR" : "DESACTIVAR",
  previous: {
    ...puesto,
    Activo: !activo
  },
  run: actor => (activo ? puestos.activarPuesto : puestos.desactivarPuesto)(7, actor),
  write: /UPDATE Puestos SET Activo/,
  before: {
    activo: !activo
  },
  after: {
    activo
  }
})), {
  name: "crear restaurante",
  entity: "Restaurantes",
  action: "CREAR",
  run: actor => restaurantes.createNewRestaurante({
    nombre: "Norte"
  }, actor),
  write: /INSERT INTO Restaurantes/,
  records: [{
    RestauranteId: 7
  }],
  before: null,
  after: {
    nombre: "Norte",
    distritoId: null,
    detalleDireccion: null
  }
}, {
  name: "editar restaurante",
  entity: "Restaurantes",
  action: "ACTUALIZAR",
  previous: restaurante,
  run: actor => restaurantes.updateExistingRestaurante(7, {
    nombre: "Norte"
  }, actor),
  write: /UPDATE Restaurantes SET Nombre/,
  before: {
    nombre: "Centro",
    distritoId: null,
    detalleDireccion: null
  },
  after: {
    nombre: "Norte",
    distritoId: null,
    detalleDireccion: null
  }
}, ...[false, true].map(activo => ({
  name: activo ? "activar restaurante" : "desactivar restaurante",
  entity: "Restaurantes",
  action: activo ? "ACTIVAR" : "DESACTIVAR",
  previous: {
    ...restaurante,
    Activo: !activo
  },
  run: actor => (activo ? restaurantes.activarRestaurante : restaurantes.desactivarRestaurante)(7, actor),
  write: /UPDATE Restaurantes SET Activo/,
  before: {
    activo: !activo
  },
  after: {
    activo
  }
})), ...[false, true].map(activo => ({
  name: activo ? "activar colaborador" : "desactivar colaborador",
  entity: "Colaboradores",
  action: activo ? "ACTIVAR" : "DESACTIVAR",
  previous: {
    ColaboradorId: 7,
    Activo: !activo
  },
  run: actor => (activo ? colaboradores.activarColaborador : colaboradores.desactivarColaborador)(7, actor),
  write: /UPDATE Colaboradores SET Activo/,
  before: {
    activo: !activo
  },
  after: {
    activo
  }
})), ...[false, true].map(activo => ({
  name: activo ? "activar usuario" : "desactivar usuario",
  entity: "Usuarios",
  action: activo ? "ACTIVAR" : "DESACTIVAR",
  previous: {
    UsuarioId: 7,
    Activo: !activo
  },
  run: actor => (activo ? auth.activarUsuario : auth.desactivarUsuario)(7, actor),
  write: /UPDATE Usuarios SET Activo/,
  before: {
    activo: !activo
  },
  after: {
    activo
  }
}))];
function expectRead(operation, records = [operation.previous]) {
  if (operation.previous) {
    expected.push({
      pattern: operation.entity === "Colaboradores" ? /FROM Colaboradores/ : new RegExp(`FROM ${operation.entity} WITH \\(UPDLOCK, HOLDLOCK\\)`),
      records
    });
  }
}
function expectWrite(operation, overrides = {}) {
  expected.push({
    pattern: operation.write,
    records: operation.records,
    ...overrides
  });
}
function expectAudit(overrides = {}) {
  expected.push({
    pattern: /INSERT INTO dbo.Bitacora/,
    ...overrides
  });
}
for (const operation of operations) {
  test(`${operation.name}: confirma escritura y bitácora en la misma transacción`, async () => {
    expectRead(operation);
    expectWrite(operation);
    expectAudit();
    expect(await operation.run(3)).toBe(true);
    expect(events[0].type).toBe("begin");
    expect(events.at(-1).type).toBe("commit");
    expect(events.filter(event => event.type === "commit").length).toBe(1);
    expect(events.some(event => event.type === "rollback")).toBe(false);
    const audit = events.at(-2).parameters;
    expect(audit.UsuarioId).toBe(3);
    expect(audit.RegistroId).toBe(7);
    expect(audit.Entidad).toBe(operation.entity);
    expect(audit.Accion).toBe(operation.action);
    expect(JSON.parse(audit.DatosAnteriores)).toEqual(operation.before);
    expect(JSON.parse(audit.DatosNuevos)).toEqual(operation.after);
  });
  for (const failure of ["escritura", "bitácora", "bitácora sin inserción", "commit", "rollback"]) {
    test(`${operation.name}: conserva el error original si falla ${failure}`, async () => {
      const error = new Error(`Fallo de ${failure}`);
      expectRead(operation);
      expectWrite(operation, failure === "escritura" ? {
        error
      } : {});
      if (failure !== "escritura") {
        expectAudit(failure === "bitácora sin inserción" ? {
          affected: 0
        } : ["bitácora", "rollback"].includes(failure) ? {
          error
        } : {});
      }
      if (failure === "commit") commitError = error;
      if (failure === "rollback") {
        rollbackError = new Error("Error secundario de rollback");
        jest.spyOn(console, "error").mockImplementation(() => {});
      }
      await assert.rejects(operation.run(3), failure === "bitácora sin inserción" ? {
        status: 500,
        message: "No se pudo registrar la bitácora"
      } : received => received === error);
      expect(events.at(-1).type).toBe("rollback");
      expect(events.filter(event => event.type === "commit").length).toBe(failure === "commit" ? 1 : 0);
    });
  }
  test(`${operation.name}: rechaza un actor inválido antes de abrir una transacción`, async () => {
    for (const actor of [undefined, null, "", 0, -1, "abc"]) {
      await assert.rejects(operation.run(actor), {
        status: 400
      });
    }
    expect(events).toEqual([]);
  });
  test(`${operation.name}: revierte cuando la escritura no afecta ningún registro`, async () => {
    expectRead(operation);
    expectWrite(operation, {
      records: [],
      affected: 0
    });
    await assert.rejects(operation.run(3), {
      status: operation.previous ? 404 : 500
    });
    expect(events.at(-1).type).toBe("rollback");
    expect(events.some(event => event.type === "commit")).toBe(false);
  });
  if (operation.previous) {
    test(`${operation.name}: revierte si no existe el registro`, async () => {
      expectRead(operation, []);
      await assert.rejects(operation.run(3), {
        status: 404
      });
      expect(events.map(event => event.type)).toEqual(["begin", "query", "rollback"]);
    });
  }
}
test("no se modifica la tarifa ni los datos de un registro inactivo", async () => {
  for (const operation of operations.filter(operation => ["CAMBIAR_TARIFA", "ACTUALIZAR"].includes(operation.action))) {
    activeTransaction = undefined;
    events = [];
    expectRead(operation, [{
      ...operation.previous,
      Activo: false
    }]);
    await assert.rejects(operation.run(3), {
      status: 409
    });
    expect(events.map(event => event.type)).toEqual(["begin", "query", "rollback"]);
  }
});
test("cambiar contraseña confirma la transacción y no copia hashes a la bitácora", async () => {
  const passwordHash = await hash("actual", 4);
  expected.push({
    pattern: /FROM Usuarios/,
    transactional: false,
    records: [{
      UsuarioId: 3,
      NombreUsuario: "ana",
      Activo: true,
      PasswordHash: passwordHash
    }]
  });
  expected.push({
    pattern: /UPDATE Usuarios SET PasswordHash/
  });
  expectAudit();
  expect(await auth.changePassword(3, "actual", "nueva")).toBe(true);
  expect(events.at(-1).type).toBe("commit");
  expect(events.some(event => event.type === "rollback")).toBe(false);
  const audit = events.at(-2).parameters;
  expect(audit.Accion).toBe("CAMBIAR_CONTRASENA");
  expect(audit.UsuarioId).toBe(3);
  expect(JSON.parse(audit.DatosAnteriores)).toEqual({
    nombreUsuario: "ana"
  });
  expect(JSON.parse(audit.DatosNuevos)).toEqual({
    nombreUsuario: "ana",
    passwordActualizada: true
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
