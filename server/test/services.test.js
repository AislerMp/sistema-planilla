import assert from "node:assert/strict";
import { test, beforeEach, afterEach, mock } from "node:test";
import { hash, compare } from "bcrypt";

// Datos ficticios: estas pruebas nunca abren una conexión a SQL Server.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/config/database.js");
const auth = await import("../src/services/authService.js");
const colaboradores = await import("../src/services/colaboradorService.js");
const puestos = await import("../src/services/puestosService.js");
const restaurantes = await import("../src/services/restaurantesService.js");
const roles = await import("../src/services/rolesService.js");
const ubicaciones = await import("../src/services/ubicacionesService.js");

let expected;
let calls;
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => {
  const parameters = {};
  return {
    input(name, type, value) {
      parameters[name] = { type, value };
      return this;
    },
    async query(query) {
      const next = expected.shift();
      assert.ok(next, `Consulta inesperada: ${query}`);
      assert.match(query, next.pattern);
      // Las aserciones de datos usan las consultas de negocio; la bitácora también
      // debe estar en la cola esperada. Su atomicidad se prueba por separado.
      if (!query.includes("INSERT INTO dbo.Bitacora")) calls.push({ query, parameters });
      if (next.error) throw next.error;
      return { recordset: next.records, rowsAffected: [next.affected] };
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
function activeReferences() {
  respond(/FROM Restaurantes WHERE RestauranteId = @id/, [{ RestauranteId: 1, Activo: true }]);
  respond(/FROM Puestos WHERE PuestoId = @id/, [{ PuestoId: 2, Activo: true }]);
}
const colaborador = {
  identificacion: "123456789", correo: "persona@example.com", nombre: "Ana", apellido: "Mora",
  fechaIngreso: "2026-01-10", restauranteId: 1, puestoId: 2,
};
const password = " clave con espacios ";
const passwordHash = await hash(password, 4);
const user = { UsuarioId: 1, NombreUsuario: "ana", PasswordHash: passwordHash, Activo: true };

test("login usa PasswordHash, conserva los espacios y no expone el hash", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario = @username/, [user]);
  const result = await auth.loginUser(" ana ", password);
  assert.equal(result.UsuarioId, 1);
  assert.equal("PasswordHash" in result, false);
  assert.equal(calls[0].parameters.username.value, "ana");
  assert.equal(calls[0].parameters.username.type.type, sql.NVarChar);
});

test("login rechaza contraseña incorrecta, usuario ausente e inactivo", async () => {
  for (const records of [[user], [], [{ ...user, Activo: false }]]) {
    respond(/FROM Usuarios/, records);
    await assert.rejects(auth.loginUser("ana", "incorrecta"), { status: 401 });
  }
});

test("registro vincula un colaborador y almacena un hash comprobable", async () => {
  respond(/FROM Usuarios/, []);
  respond(/FROM Roles/, [{ RolId: 1 }]);
  respond(/FROM Colaboradores/, [{ ColaboradorId: 5, Activo: true }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, []);
  respond(/INSERT INTO Usuarios/, [{ UsuarioId: 8 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await auth.registerUser({ nombreUsuario: " admin ", password, rolId: "1", colaboradorId: "5" }, 3), 8);
  assert.equal(calls[0].parameters.includeInactive.value, true);
  const values = calls.at(-1).parameters;
  assert.equal(values.ColaboradorId.value, 5);
  assert.equal(values.NombreUsuario.value, "admin");
  assert.notEqual(values.PasswordHash.value, password);
  assert.equal(await compare(password, values.PasswordHash.value), true);
});

test("registro detecta nombres reservados por cuentas inactivas", async () => {
  respond(/FROM Usuarios/, [{ ...user, Activo: false }]);
  await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password, rolId: 1, colaboradorId: 5 }, 3), { status: 409 });
  assert.equal(calls[0].parameters.includeInactive.value, true);
});

test("registro rechaza un colaborador que ya tiene cuenta", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario/, []);
  respond(/FROM Roles/, [{ RolId: 1 }]);
  respond(/FROM Colaboradores/, [{ ColaboradorId: 5, Activo: true }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, [{ UsuarioId: 9, Activo: false }]);
  await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password, rolId: 1, colaboradorId: 5 }, 3), { status: 409 });
});

test("registro valida la contraseña obligatoria y la existencia del rol", async () => {
  await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password: "", rolId: 1, colaboradorId: 5 }, 3), { status: 400 });
  respond(/FROM Usuarios/, []);
  respond(/FROM Roles/, []);
  await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password, rolId: 999, colaboradorId: 5 }, 3), { status: 404 });
});

test("registro exige un colaborador válido antes de consultar", async () => {
  for (const colaboradorId of [undefined, null, "", 0, "abc"]) {
    await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password, rolId: 1, colaboradorId }, 3), { status: 400 });
  }
  assert.equal(calls.length, 0);
});

test("registro rechaza colaboradores inexistentes o inactivos", async () => {
  for (const [records, status] of [[[], 404], [[{ ColaboradorId: 5, Activo: false }], 409]]) {
    respond(/FROM Usuarios WHERE NombreUsuario/, []);
    respond(/FROM Roles/, [{ RolId: 1 }]);
    respond(/FROM Colaboradores/, records);
    await assert.rejects(auth.registerUser({ nombreUsuario: "ana", password, rolId: 1, colaboradorId: 5 }, 3), { status });
  }
});

test("consultar un rol solo exige su existencia, sin columna Activo", async () => {
  const rol = { RolId: 1, Codigo: "ADMIN", Nombre: "Administrador" };
  respond(/FROM Roles WHERE RolId/, [rol]);
  assert.deepEqual(await roles.getRol(1), rol);
});

test("consultas de usuarios nunca devuelven hashes", async () => {
  respond(/FROM Usuarios WHERE Activo = 1/, [user]);
  respond(/FROM Usuarios WHERE UsuarioId = @id/, [user]);
  const list = await auth.getUsers();
  const result = await auth.getUser(1);
  assert.equal("PasswordHash" in list[0], false);
  assert.equal("PasswordHash" in result, false);
});

test("cambiar contraseña exige la actual y guarda la nueva cifrada", async () => {
  respond(/FROM Usuarios/, [user]);
  await assert.rejects(auth.changePassword(1, "incorrecta", "nueva"), { status: 401 });
  respond(/FROM Usuarios/, [user]);
  respond(/UPDATE Usuarios SET PasswordHash.*AND Activo = 1/);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await auth.changePassword(1, password, " nueva "), true);
  assert.equal(await compare(" nueva ", calls.at(-1).parameters.PasswordHash.value), true);
});

test("IDs inválidos se rechazan antes de consultar la base", async () => {
  for (const id of [0, -1, 1.5, true, [], {}, "abc", "1.5", " ", Infinity, 2147483648]) {
    for (const read of [auth.getUser, colaboradores.getColaborador, puestos.getPuesto, restaurantes.getRestaurante, roles.getRol, ubicaciones.getDistrito]) {
      await assert.rejects(read(id), { status: 400 });
    }
  }
  assert.equal(calls.length, 0);
});

test("activar y desactivar exigen IDs y actores válidos antes de consultar", async () => {
  for (const action of [
    colaboradores.activarColaborador, colaboradores.desactivarColaborador,
    puestos.activarPuesto, puestos.desactivarPuesto,
    restaurantes.activarRestaurante, restaurantes.desactivarRestaurante,
  ]) {
    await assert.rejects(action("abc", 3), { status: 400 });
    for (const actor of ["false", "true", 0, -1, null, undefined]) {
      await assert.rejects(action(1, actor), { status: 400 });
    }
  }
  assert.equal(calls.length, 0);
});

test("crear colaborador incluye correo, tipos correctos y opcionales nulos", async () => {
  activeReferences();
  respond(/INSERT INTO Colaboradores \(Identificacion, Correo,/, [{ ColaboradorId: 12 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await colaboradores.createNewColaborador(colaborador, 3), 12);
  const parameters = calls.at(-1).parameters;
  assert.equal(parameters.Correo.value, colaborador.correo);
  assert.equal(parameters.Correo.type.length, 100);
  assert.equal(parameters.Identificacion.type.length, 30);
  assert.equal(parameters.Nombres.type.length, 100);
  assert.equal(parameters.Apellidos.type.length, 100);
  assert.equal(parameters.FechaIngreso.type, sql.Date);
  assert.equal(parameters.FechaIngreso.value.toISOString(), "2026-01-10T00:00:00.000Z");
  assert.equal(parameters.FechaSalida.value, null);
  assert.equal(parameters.DistritoId.value, null);
  assert.equal(parameters.DetalleDireccion.value, null);
});

test("editar colaborador también actualiza el correo", async () => {
  activeReferences();
  respond(/FROM Colaboradores/, [{ ColaboradorId: 12, Activo: true }]);
  respond(/UPDATE Colaboradores[\s\S]*Correo = @Correo/);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await colaboradores.updateExistingColaborador("12", colaborador, 3), true);
  assert.equal(calls.at(-1).parameters.id.value, 12);
});

test("colaboradores rechazan correo inválido, fechas imposibles e intervalos invertidos", async () => {
  for (const changes of [
    { correo: undefined }, { correo: "sin-arroba" }, { fechaIngreso: "2026-02-30" },
    { fechaIngreso: "2026-13-01" }, { fechaIngreso: "0000-01-01" },
    { fechaSalida: "2026-01-09" }, { distritoId: "abc" }, { nombre: "a".repeat(101) },
  ]) {
    await assert.rejects(colaboradores.createNewColaborador({ ...colaborador, ...changes }, 3), { status: 400 });
  }
  assert.equal(calls.length, 0);
});

test("no se asignan colaboradores a restaurantes o puestos inactivos", async () => {
  respond(/FROM Restaurantes/, [{ Activo: false }]);
  await assert.rejects(colaboradores.createNewColaborador(colaborador, 3), { status: 409 });
  respond(/FROM Restaurantes/, [{ Activo: true }]);
  respond(/FROM Puestos/, [{ Activo: false }]);
  await assert.rejects(colaboradores.createNewColaborador(colaborador, 3), { status: 409 });
});

test("crear puesto respeta NVARCHAR(80), DECIMAL(12,2) y la tarifa opcional", async () => {
  respond(/INSERT INTO Puestos/, [{ PuestoId: 7 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await puestos.createNewPuesto({ nombre: "a".repeat(80), tarifaHora: "9999999999.99" }, 3), true);
  assert.equal(calls[0].parameters.Nombre.type.length, 80);
  assert.equal(calls[0].parameters.TarifaHora.type.precision, 12);
  assert.equal(calls[0].parameters.TarifaHora.type.scale, 2);
  respond(/INSERT INTO Puestos/, [{ PuestoId: 8 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  await puestos.createNewPuesto({ nombre: "Cajero" }, 3);
  assert.equal(calls[1].parameters.TarifaHora.value, null);
});

test("puestos rechazan tarifas negativas, excesivas o con más de dos decimales", async () => {
  for (const tarifaHora of [0, -1, 1.234, "10000000000", "abc", true, Infinity]) {
    await assert.rejects(puestos.createNewPuesto({ nombre: "Cajero", tarifaHora }, 3), { status: 400 });
  }
});

test("la tarifa de un puesto activo puede actualizarse o dejarse pendiente", async () => {
  for (const tarifa of [1500.25, null]) {
    respond(/FROM Puestos/, [{ PuestoId: 1, Activo: true }]);
    respond(/UPDATE Puestos SET TarifaHora.*AND Activo = 1/);
    respond(/INSERT INTO dbo.Bitacora/);
    assert.equal(await puestos.updateTarifaPuesto(1, tarifa, 3), true);
    assert.equal(calls.at(-1).parameters.TarifaHora.value, tarifa);
  }
});

test("restaurantes admiten dirección ausente o completa de hasta 300 caracteres", async () => {
  respond(/INSERT INTO Restaurantes/, [{ RestauranteId: 7 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await restaurantes.createNewRestaurante({ nombre: "Centro" }, 3), true);
  assert.equal(calls[0].parameters.distritoId.value, null);
  respond(/INSERT INTO Restaurantes/, [{ RestauranteId: 8 }]);
  respond(/INSERT INTO dbo.Bitacora/);
  await restaurantes.createNewRestaurante({ nombre: "Norte", distritoId: 10101, detalleDireccion: "a".repeat(300) }, 3);
  assert.equal(calls.at(-1).parameters.detalleDireccion.type.length, 300);
});

test("restaurantes rechazan direcciones incompletas y propagan errores de integridad", async () => {
  for (const direccion of [{ distritoId: 10101 }, { detalleDireccion: "Centro" }]) {
    await assert.rejects(restaurantes.createNewRestaurante({ nombre: "Centro", ...direccion }, 3), { status: 400 });
  }
  const error = Object.assign(new Error("Distrito inexistente"), { number: 547 });
  expected.push({ pattern: /INSERT INTO Restaurantes/, error });
  await assert.rejects(restaurantes.createNewRestaurante({ nombre: "Centro", distritoId: 99999, detalleDireccion: "Calle 1" }, 3), received => received === error);
});

test("se puede editar un restaurante activo y reactivar uno inactivo", async () => {
  respond(/FROM Restaurantes/, [{ RestauranteId: 1, Activo: true }]);
  respond(/UPDATE Restaurantes SET Nombre/);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await restaurantes.updateExistingRestaurante(1, { nombre: "Centro" }, 3), true);
  respond(/FROM Restaurantes/, [{ RestauranteId: 1, Activo: false }]);
  respond(/UPDATE Restaurantes SET Activo = @activo WHERE RestauranteId = @id/);
  respond(/INSERT INTO dbo.Bitacora/);
  assert.equal(await restaurantes.activarRestaurante(1, 3), true);
  assert.equal(calls.at(-1).parameters.activo.value, true);
});

test("consultas individuales permiten recuperar puestos y restaurantes inactivos", async () => {
  respond(/FROM Puestos WHERE PuestoId = @id$/, [{ PuestoId: 1, Activo: false }]);
  respond(/FROM Restaurantes WHERE RestauranteId = @id$/, [{ RestauranteId: 1, Activo: false }]);
  assert.equal((await puestos.getPuesto(1)).Activo, false);
  assert.equal((await restaurantes.getRestaurante(1)).Activo, false);
});

test("catálogos territoriales filtran por el ID del padre", async () => {
  respond(/FROM Provincias WHERE ProvinciaId/, [{ ProvinciaId: 1 }]);
  respond(/FROM Cantones WHERE ProvinciaId = @idProvincia/, [{ CantonId: 101 }]);
  assert.deepEqual(await ubicaciones.getCantones("1"), [{ CantonId: 101 }]);
  assert.equal(calls.at(-1).parameters.idProvincia.value, 1);
  respond(/FROM Cantones WHERE CantonId/, [{ CantonId: 101 }]);
  respond(/FROM Distritos WHERE CantonId = @idCanton/, [{ DistritoId: 10101 }]);
  assert.deepEqual(await ubicaciones.getDistritos(101), [{ DistritoId: 10101 }]);
  assert.equal(calls.at(-1).parameters.idCanton.value, 101);
});

test("catálogos distinguen padres inexistentes de listas vacías", async () => {
  respond(/FROM Provincias WHERE ProvinciaId/, []);
  await assert.rejects(ubicaciones.getCantones(99), { status: 404 });
  respond(/FROM Cantones WHERE CantonId/, []);
  await assert.rejects(ubicaciones.getDistritos(999), { status: 404 });
  respond(/FROM Roles WHERE RolId/, []);
  await assert.rejects(roles.getRol(99), { status: 404 });
});

test("listas vacías de los catálogos y colaboradores devuelven arreglos", async () => {
  for (const [list, table] of [
    [roles.getRoles, "Roles"], [ubicaciones.getProvincias, "Provincias"],
    [puestos.getPuestos, "Puestos"], [restaurantes.getRestaurantes, "Restaurantes"],
    [colaboradores.getColaboradores, "Colaboradores"],
  ]) {
    respond(new RegExp(`FROM ${table}`), undefined);
    assert.deepEqual(await list(), []);
  }
});

test("activar o desactivar un registro inexistente produce 404", async () => {
  for (const [action, table] of [
    [puestos.activarPuesto, "Puestos"], [puestos.desactivarPuesto, "Puestos"],
    [restaurantes.activarRestaurante, "Restaurantes"], [restaurantes.desactivarRestaurante, "Restaurantes"],
    [colaboradores.activarColaborador, "Colaboradores"], [colaboradores.desactivarColaborador, "Colaboradores"],
  ]) {
    respond(new RegExp(`FROM ${table}`), []);
    await assert.rejects(action(999, 3), { status: 404 });
  }
});

test("errores SQL de escritura se propagan sin capturarlos ni transformarlos", async () => {
  for (const number of [2601, 2627, 547]) {
    const error = Object.assign(new Error("SQL"), { number });
    expected.push({ pattern: /INSERT INTO Puestos/, error });
    await assert.rejects(puestos.createNewPuesto({ nombre: "Cajero" }, 3), (received) => received === error);
  }
});

test("registerUser propaga el error original si falla la creación", async () => {
  respond(/FROM Usuarios WHERE NombreUsuario/, []);
  respond(/FROM Roles/, [{ RolId: 1 }]);
  respond(/FROM Colaboradores/, [{ ColaboradorId: 5, Activo: true }]);
  respond(/FROM Usuarios WHERE ColaboradorId/, []);
  const error = Object.assign(new Error("Nombre duplicado por una escritura concurrente"), { number: 2627 });
  expected.push({ pattern: /INSERT INTO Usuarios/, error });
  await assert.rejects(
    auth.registerUser({ nombreUsuario: "ana", password, rolId: 1, colaboradorId: 5 }, 3),
    (received) => received === error,
  );
});

test("los servicios propagan errores de lectura sin transformarlos", async () => {
  for (const [read, table] of [[roles.getRol, "Roles"], [ubicaciones.getDistrito, "Distritos"], [auth.getUser, "Usuarios"]]) {
    const error = new Error("Conexión interrumpida");
    expected.push({ pattern: new RegExp(`FROM ${table}`), error });
    await assert.rejects(read(1), (received) => received === error);
  }
});
