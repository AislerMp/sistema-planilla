import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import { esperarSaldoInicial } from "../support/saldoInicial.js";
beforeEach(() => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => {
    const parameters = {};
    return {
      input(name, type, value) {
        parameters[name] = value;
        return this;
      },
      async query(query) {
        const response = expected.shift();
        assert.ok(response, `Consulta inesperada: ${query}`);
        expect(query).toMatch(response.pattern);
        calls.push({
          query,
          parameters
        });
        if (response.error) throw response.error;
        return {
          recordset: response.records,
          rowsAffected: [response.affected]
        };
      }
    };
  });
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => pool.request());
});
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { hash } from "bcrypt";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

// Se ejecutan controladores y servicios reales, pero no se conecta a SQL Server.
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
const auth = await import("../../src/modules/auth/auth.controller.js");
const colaboradores = await import("../../src/modules/colaboradores/colaboradores.controller.js");
const puestos = await import("../../src/modules/puestos/puestos.controller.js");
const restaurantes = await import("../../src/modules/restaurantes/restaurantes.controller.js");
const roles = await import("../../src/modules/roles/roles.controller.js");
const ubicaciones = await import("../../src/modules/ubicaciones/ubicaciones.controller.js");
const permisosLaborales = await import("../../src/modules/permisosLaborales/permisosLaborales.controller.js");
let expected;
let calls;
beforeEach(() => {
  expected = [];
  calls = [];
});
afterEach(() => assert.equal(expected.length, 0, "Faltaron consultas esperadas"));
function respond(pattern, records = [], affected = 1) {
  expected.push({
    pattern,
    records,
    affected
  });
}
async function invoke(controller, req = {}) {
  const result = {};
  const app = express();
  app.use(express.json());
  app.post("/", (request, response, next) => {
    request.session = {};
    request.params = req.params ?? {};
    request.user = Object.hasOwn(req, "user") ? req.user : {
      UsuarioId: 3
    };
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
      headers: {
        "Content-Type": "application/json"
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body)
    });
    result.status = response.status;
    result.body = await response.json();
    return result;
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
const lists = [[auth.getUsersController, "Usuarios"], [colaboradores.getColaboradoresController, "Colaboradores"], [puestos.getPuestosController, "Puestos"], [restaurantes.getRestaurantesController, "Restaurantes"], [roles.getRolesController, "Roles"], [ubicaciones.getProvinciasController, "Provincias"]];
const details = [[colaboradores.getColaboradorByIdController, "Colaboradores"], [puestos.getPuestoController, "Puestos"], [restaurantes.getRestauranteController, "Restaurantes"], [roles.getRolController, "Roles"], [ubicaciones.getProvinciaController, "Provincias"], [ubicaciones.getCantonController, "Cantones"], [ubicaciones.getDistritoController, "Distritos"]];
const accionesEstado = [[colaboradores.activarColaboradorController, "Colaboradores", true], [colaboradores.desactivarColaboradorController, "Colaboradores", false], [puestos.activarPuestoController, "Puestos", true], [puestos.desactivarPuestoController, "Puestos", false], [restaurantes.activarRestauranteController, "Restaurantes", true], [restaurantes.desactivarRestauranteController, "Restaurantes", false]];
test("las listas responden 200, incluso cuando están vacías", async () => {
  for (const [controller, table] of lists) {
    for (const records of [[], [table === "Usuarios" ? {
      NombreUsuario: "ana",
      RolId: 1,
      Rol: "ADMINISTRADOR"
    } : {
      Nombre: "Ejemplo"
    }]]) {
      respond(new RegExp(`FROM ${table}`), records);
      if (table === "Usuarios" && records.length) respond(/FROM Roles/, [{
        Codigo: "ADMINISTRADOR"
      }]);
      const result = await invoke(controller);
      expect(result.status).toBe(200);
      expect(result.body).toEqual(records);
    }
  }
});
test("gerente consulta permisos laborales de su restaurante con el usuario autenticado", async () => {
  respond(/FROM Usuarios AS u/, [{
    RestauranteId: 2
  }]);
  respond(/UPDATE s/);
  respond(/FROM dbo\.PermisosLaborales AS d/, []);
  const result = await invoke(permisosLaborales.listarPermisosPorRestauranteController, {
    user: {
      UsuarioId: 7,
      Rol: "GERENTE"
    }
  });
  expect(result.status).toBe(200);
  expect(result.body).toEqual([]);
});
test("administración consulta todos los permisos sin elegir restaurante", async () => {
  respond(/UPDATE s/);
  respond(/FROM dbo\.PermisosLaborales AS d/);
  const result = await invoke(permisosLaborales.listarPermisosPorRestauranteController, {
    user: {
      UsuarioId: 3,
      Rol: "ADMINISTRADOR"
    }
  });
  expect(result.status).toBe(200);
  expect(result.body).toEqual([]);
  expect(calls.at(-1).parameters.restauranteId).toBe(null);
});
test("las consultas individuales distinguen éxito, ID inválido y registro ausente", async () => {
  for (const [controller, table] of details) {
    respond(new RegExp(`FROM ${table}`), [{
      Nombre: "Ejemplo"
    }]);
    const result = await invoke(controller, {
      params: {
        id: "7"
      }
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      Nombre: "Ejemplo"
    });
    expect(calls.at(-1).parameters.id).toBe(7);
    const invalid = await invoke(controller, {
      params: {
        id: "abc"
      }
    });
    expect(invalid.status).toBe(400);
    expect(typeof invalid.body.message).toBe("string");
    respond(new RegExp(`FROM ${table}`));
    const missing = await invoke(controller, {
      params: {
        id: "99"
      }
    });
    expect(missing.status).toBe(404);
  }
});
test("los errores internos de cada controlador se entregan al middleware", async () => {
  const logger = jest.spyOn(console, "error").mockImplementation(() => {});
  for (const [controller, table] of lists) {
    const error = new Error("Detalle privado de SQL");
    expected.push({
      pattern: new RegExp(`FROM ${table}`),
      error
    });
    const result = await invoke(controller);
    expect(result.error).toBe(error);
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      message: "No fue posible procesar la solicitud"
    });
  }
  expect(logger.mock.calls.length).toBe(lists.length);
});
test("activar y desactivar fijan su estado sin necesitar ni leer el body", async () => {
  for (const [controller, table, activo] of accionesEstado) {
    for (const body of [undefined, {}, {
      activo: !activo
    }, {
      activo: "false"
    }, {
      activo: null
    }]) {
      respond(new RegExp(`FROM ${table}`), [{
        Activo: !activo
      }]);
      respond(new RegExp(`UPDATE ${table} SET Activo`));
      respond(/INSERT INTO dbo.Bitacora/);
      const result = await invoke(controller, {
        params: {
          id: "7"
        },
        body
      });
      expect(result.status).toBe(200);
      expect(result.body.activo).toBe(activo);
      expect(calls.at(-2).parameters.activo).toBe(activo);
      expect(calls.at(-1).parameters.UsuarioId).toBe(3);
      expect(calls.at(-1).parameters.Accion).toBe(activo ? "ACTIVAR" : "DESACTIVAR");
      expect(JSON.parse(calls.at(-1).parameters.DatosNuevos)).toEqual({
        activo
      });
    }
    respond(new RegExp(`FROM ${table}`), []);
    expect((await invoke(controller, {
      params: {
        id: "99"
      }
    })).status).toBe(404);
  }
});
test("las bajas desactivan registros sin eliminarlos ni aceptar otro estado del body", async () => {
  for (const [controller, table] of [[colaboradores.desactivarColaboradorController, "Colaboradores"], [puestos.desactivarPuestoController, "Puestos"], [restaurantes.desactivarRestauranteController, "Restaurantes"]]) {
    respond(new RegExp(`FROM ${table}`), [{
      Activo: true
    }]);
    respond(new RegExp(`UPDATE ${table} SET Activo`));
    respond(/INSERT INTO dbo.Bitacora/);
    const result = await invoke(controller, {
      params: {
        id: "7"
      },
      body: {
        activo: true
      },
      user: {
        UsuarioId: 3
      }
    });
    expect(result.status).toBe(200);
    expect(result.body.activo).toBe(false);
    expect(calls.find(call => call.query.includes(`UPDATE ${table}`)).parameters.activo).toBe(false);
  }
});
test("las creaciones rechazan cuerpos ausentes y anuncian éxito solo si hubo inserción", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  for (const [controller, table] of [[puestos.createPuestoController, "Puestos"], [restaurantes.createRestauranteController, "Restaurantes"]]) {
    expect((await invoke(controller)).status).toBe(400);
    respond(new RegExp(`INSERT INTO ${table}`), [table === "Puestos" ? {
      PuestoId: 7
    } : {
      RestauranteId: 7
    }]);
    respond(/INSERT INTO dbo.Bitacora/);
    expect((await invoke(controller, {
      body: {
        nombre: "Centro"
      }
    })).status).toBe(201);
    respond(new RegExp(`INSERT INTO ${table}`), [], 0);
    const failed = await invoke(controller, {
      body: {
        nombre: "Centro"
      }
    });
    expect(failed.error instanceof Error).toBeTruthy();
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({
      message: "No fue posible procesar la solicitud"
    });
  }
});
const colaborador = {
  identificacion: "123456789",
  correo: "ana@example.com",
  nombre: "Ana",
  apellido: "Mora",
  fechaIngreso: "2026-01-10",
  restauranteId: 1,
  puestoId: 2
};
function activeReferences() {
  respond(/FROM Restaurantes/, [{
    RestauranteId: 1,
    Activo: true
  }]);
  respond(/FROM Puestos/, [{
    PuestoId: 2,
    Activo: true
  }]);
}
test("crear colaborador devuelve el ID generado y editar usa el ID de la ruta", async () => {
  expect((await invoke(colaboradores.createColaboradorController)).status).toBe(400);
  activeReferences();
  respond(/INSERT INTO Colaboradores/, [{
    ColaboradorId: 12
  }]);
  respond(/INSERT INTO dbo.Bitacora/);
  esperarSaldoInicial(respond);
  const created = await invoke(colaboradores.createColaboradorController, {
    body: colaborador,
    user: {
      UsuarioId: 3
    }
  });
  expect(created.status).toBe(201);
  expect(created.body.id).toBe(12);
  activeReferences();
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 12,
    Activo: true
  }]);
  respond(/UPDATE Colaboradores/);
  respond(/INSERT INTO dbo.Bitacora/);
  const updated = await invoke(colaboradores.updateColaboradorController, {
    params: {
      id: "12"
    },
    body: {
      ...colaborador,
      id: 99
    },
    user: {
      UsuarioId: 3
    }
  });
  expect(updated.status).toBe(200);
  expect(updated.body.actualizado).toBe(true);
  expect(calls.find(call => call.query.includes("UPDATE Colaboradores")).parameters.id).toBe(12);
  expect(calls.at(-1).parameters.UsuarioId).toBe(3);
});
test("editar restaurante valida el cuerpo y conserva el conflicto por inactividad", async () => {
  const controller = restaurantes.updateRestauranteController;
  expect((await invoke(controller, {
    params: {
      id: "7"
    }
  })).status).toBe(400);
  respond(/FROM Restaurantes/, [{
    Activo: true
  }]);
  respond(/UPDATE Restaurantes SET Nombre/);
  respond(/INSERT INTO dbo.Bitacora/);
  expect((await invoke(controller, {
    params: {
      id: "7"
    },
    body: {
      nombre: "Centro"
    }
  })).status).toBe(200);
  respond(/FROM Restaurantes/, [{
    Activo: false
  }]);
  const inactive = await invoke(controller, {
    params: {
      id: "7"
    },
    body: {
      nombre: "Centro"
    }
  });
  expect(inactive.status).toBe(409);
  expect(inactive.body.message).toBe("Restaurante está inactivo");
});
test("actualizar tarifa exige el campo, permite null explícito y valida su valor", async () => {
  const controller = puestos.updateTarifaPuestoController;
  for (const body of [undefined, {}, {
    tarifaHora: -1
  }]) {
    expect((await invoke(controller, {
      params: {
        id: "7"
      },
      body
    })).status).toBe(400);
  }
  expect(calls.length).toBe(0);
  for (const tarifaHora of [1500.25, null]) {
    respond(/FROM Puestos/, [{
      Activo: true
    }]);
    respond(/UPDATE Puestos SET TarifaHora/);
    respond(/INSERT INTO dbo.Bitacora/);
    const result = await invoke(controller, {
      params: {
        id: "7"
      },
      body: {
        tarifaHora
      }
    });
    expect(result.status).toBe(200);
    expect(calls.at(-2).parameters.TarifaHora).toBe(tarifaHora);
  }
});
test("cantones y distritos usan el parámetro del padre y distinguen ausencia de lista vacía", async () => {
  for (const [controller, field, parent, table, parameter] of [[ubicaciones.getCantonesController, "provinciaId", "Provincias", "Cantones", "idProvincia"], [ubicaciones.getDistritosController, "cantonId", "Cantones", "Distritos", "idCanton"]]) {
    for (const records of [[], [{
      Nombre: "Centro"
    }]]) {
      respond(new RegExp(`FROM ${parent}`), [{
        Nombre: "Padre"
      }]);
      respond(new RegExp(`FROM ${table}`), records);
      const result = await invoke(controller, {
        params: {
          [field]: "7",
          id: "99"
        }
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual(records);
      expect(calls.at(-1).parameters[parameter]).toBe(7);
    }
    respond(new RegExp(`FROM ${parent}`));
    expect((await invoke(controller, {
      params: {
        [field]: "7"
      }
    })).status).toBe(404);
    expect((await invoke(controller, {
      params: {}
    })).status).toBe(400);
  }
});
test("auth conserva mensajes de validación, credenciales, ausencia y conflictos", async () => {
  const invalid = await invoke(auth.loginUserController);
  expect(invalid.status).toBe(400);
  expect(invalid.body.message).toBe("Nombre de usuario es obligatorio y debe tener como máximo 60 caracteres");
  respond(/FROM Usuarios/, []);
  const denied = await invoke(auth.loginUserController, {
    body: {
      nombreUsuario: "ana",
      password: "incorrecta"
    }
  });
  expect(denied.status).toBe(401);
  expect(denied.body.message).toBe("Credenciales incorrectas");
  respond(/FROM Usuarios/, []);
  const missing = await invoke(auth.getUserController, {
    params: {
      id: "7"
    }
  });
  expect(missing.status).toBe(404);
  expect(missing.body.message).toBe("Usuario no encontrado");
  respond(/FROM Usuarios/, [{
    UsuarioId: 7
  }]);
  const duplicate = await invoke(auth.registerUserController, {
    user: {
      UsuarioId: 3
    },
    body: {
      nombreUsuario: "ana",
      password: "clave",
      rolId: 1,
      colaboradorId: 7
    }
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.message).toBe("El nombre de usuario ya está en uso");
  const password = await invoke(auth.changePasswordController, {
    user: {
      UsuarioId: 3
    },
    body: {
      currentPassword: "",
      newPassword: "nueva"
    }
  });
  expect(password.status).toBe(400);
  expect(password.body.message).toBe("La contraseña es obligatoria");
});
test("login y consulta de usuario conservan las respuestas públicas sin el hash", async () => {
  const user = {
    UsuarioId: 7,
    NombreUsuario: "ana",
    RolId: 1,
    Rol: "ADMINISTRADOR",
    ColaboradorId: 12,
    Activo: true
  };
  const stored = {
    ...user,
    PasswordHash: await hash("clave", 4)
  };
  respond(/FROM Usuarios/, [stored]);
  respond(/FROM Roles/, [{
    Codigo: "ADMINISTRADOR"
  }]);
  const login = await invoke(auth.loginUserController, {
    body: {
      nombreUsuario: "ana",
      password: "clave"
    }
  });
  expect(login.status).toBe(200);
  expect(login.body.user).toEqual(user);
  respond(/FROM Usuarios/, [stored]);
  respond(/FROM Roles/, [{
    Codigo: "ADMINISTRADOR"
  }]);
  const detail = await invoke(auth.getUserController, {
    params: {
      id: "7"
    }
  });
  expect(detail.status).toBe(200);
  expect(detail.body).toEqual(user);
});
test("activar colaborador usa el actor autenticado e ignora el estado del body", async () => {
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 7,
    Activo: false
  }]);
  respond(/UPDATE Colaboradores SET Activo/);
  respond(/INSERT INTO dbo.Bitacora/);
  const result = await invoke(colaboradores.activarColaboradorController, {
    params: {
      id: "7"
    },
    user: {
      UsuarioId: 3
    },
    body: {
      activo: false,
      usuarioActorId: 99
    }
  });
  expect(result.status).toBe(200);
  expect(result.body.activo).toBe(true);
  expect(calls[1].parameters.activo).toBe(true);
  expect(calls[2].parameters.UsuarioId).toBe(3);
});
test("las escrituras de catálogos exigen el actor autenticado e ignoran el enviado en el body", async () => {
  for (const controller of [puestos.createPuestoController, puestos.updateTarifaPuestoController, puestos.activarPuestoController, puestos.desactivarPuestoController, restaurantes.createRestauranteController, restaurantes.updateRestauranteController, restaurantes.activarRestauranteController, restaurantes.desactivarRestauranteController]) {
    const result = await invoke(controller, {
      params: {
        id: "7"
      },
      user: undefined,
      body: {
        nombre: "Centro",
        tarifaHora: 1500,
        activo: true,
        usuarioActorId: 99
      }
    });
    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/usuarioActorId/);
  }
  expect(calls.length).toBe(0);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
