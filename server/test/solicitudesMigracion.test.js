import assert from "node:assert/strict";
import { test } from "node:test";

// Estas pruebas simulan SQL Server; no ejecutan la migración ni abren conexiones.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const extras = await import("../src/modules/extras/horasExtras.service.js");
const permisos = await import("../src/modules/permisosLaborales/permisosLaborales.service.js");
const extrasRepository = await import("../src/modules/extras/horasExtras.repository.js");
const permisosRepository = await import("../src/modules/permisosLaborales/permisosLaborales.repository.js");

for (const esExtras of [true, false]) {
  const tipo = esExtras ? "HORAS_EXTRAS" : "PERMISO_LABORAL";
  const tabla = esExtras ? "SolicitudesHorasExtras" : "PermisosLaborales";
  for (const caso of ["creada", "duplicada", "detalle falla", "bitácora falla"]) {
    test(`${tipo}: creación ${caso} mantiene cabecera y detalle juntos`, async (t) => {
      const eventos = [];
      const usuario = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
      const datos = { fechaSolicitada: "2099-06-15", motivo: " Apoyo ñ ", minutosSolicitados: 60 };
      const solicitud = {
        SolicitudId: 11, TipoSolicitud: tipo, ColaboradorId: 4, RestauranteId: 2,
        RegistradoPorUsuarioId: 7, FechaSolicitada: new Date(datos.fechaSolicitada),
        Motivo: "Apoyo ñ", Estado: "PENDIENTE", RevisadoPorGerenteId: null, RevisadoPorRhId: null,
        ...(esExtras ? { MinutosSolicitados: 60, MinutosAutorizados: null } : {}),
      };
      const fallo = new Error(caso);
      let transaction;
      t.mock.method(pool, "connect", async () => pool);
      t.mock.method(pool, "request", () => ({
        input() { return this; },
        async query(query) {
          assert.match(query, /FROM Colaboradores/);
          return { recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }] };
        },
      }));
      t.mock.method(sql.Transaction.prototype, "begin", async function () {
        transaction = this;
        eventos.push("begin");
      });
      t.mock.method(sql.Transaction.prototype, "commit", async () => eventos.push("commit"));
      t.mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
      t.mock.method(sql.Transaction.prototype, "request", function () {
        assert.equal(this, transaction);
        const parametros = {};
        return {
          input(name, type, value) { parametros[name] = value; return this; },
          async query(query) {
            if (query.includes("FROM dbo.Colaboradores")) {
              assert.match(query, /WITH \(UPDLOCK, HOLDLOCK\)/);
              assert.equal(parametros.colaboradorId, usuario.ColaboradorId);
              eventos.push("bloquear");
              return { recordset: [{ ColaboradorId: 4 }] };
            }
            if (query.includes("SELECT TOP (1)")) {
              assert.equal(eventos.at(-1), "bloquear");
              assert.match(query, new RegExp(`s.TipoSolicitud = '${tipo}'`));
              assert.match(query, /d.FechaSolicitada = @fecha/);
              // Incluso un permiso rechazado impide crear otro para esa fecha.
              assert.doesNotMatch(query, /Estado = 'PENDIENTE'/);
              eventos.push("buscar");
              return { recordset: caso === "duplicada" ? [{ ...solicitud, Estado: "RECHAZADA" }] : [] };
            }
            if (query.includes("INSERT INTO dbo.Solicitudes (")) {
              eventos.push("cabecera");
              assert.equal(parametros.tipoSolicitud, tipo);
              assert.equal(parametros.registradoPorUsuarioId, usuario.UsuarioId);
              assert.equal(parametros.motivo, "Apoyo ñ");
              return { recordset: [{ SolicitudId: 11 }] };
            }
            if (query.includes(`INSERT INTO dbo.${tabla}`)) {
              eventos.push("detalle");
              assert.equal(parametros.solicitudId, 11);
              if (esExtras) assert.match(query, /s.TipoSolicitud = 'HORAS_EXTRAS'/);
              else assert.match(query, /VALUES\s*\(@solicitudId, @fechaSolicitada\)/);
              if (caso === "detalle falla") throw fallo;
              return { rowsAffected: [1] };
            }
            if (query.includes("SELECT")) {
              eventos.push("leer");
              assert.match(query, /s.SolicitudId = d.SolicitudId/);
              return { recordset: [solicitud] };
            }
            assert.match(query, /INSERT INTO dbo.Bitacora/);
            eventos.push("bitacora");
            assert.equal(parametros.Entidad, "Solicitudes");
            assert.equal(parametros.RegistroId, 11);
            assert.equal(JSON.parse(parametros.DatosNuevos).TipoSolicitud, tipo);
            if (caso === "bitácora falla") throw fallo;
            return { rowsAffected: [1] };
          },
        };
      });
      const crear = () => esExtras
        ? extras.crearSolicitudHorasExtras(usuario, datos)
        : permisos.solicitarPermiso(datos, usuario);
      if (caso === "creada") {
        assert.deepEqual(await crear(), solicitud);
        assert.deepEqual(eventos, ["begin", "bloquear", "buscar", "cabecera", "detalle", "leer", "bitacora", "commit"]);
      } else {
        await assert.rejects(crear(), caso === "duplicada" ? { status: esExtras ? 409 : 400 } : error => error === fallo);
        assert.equal(eventos.at(-1), "rollback");
        assert.equal(eventos.includes("commit"), false);
        if (caso === "duplicada") assert.equal(eventos.includes("cabecera"), false);
      }
    });
  }

  test(`${tipo}: un ID de otro tipo no se consulta ni resuelve`, async (t) => {
    t.mock.method(pool, "connect", async () => pool);
    t.mock.method(pool, "request", () => ({
      input() { return this; },
      async query(query) {
        assert.match(query, /s.SolicitudId = @solicitudId/);
        assert.match(query, new RegExp(`s.TipoSolicitud = '${tipo}'`));
        return { recordset: [] };
      },
    }));
    t.mock.method(sql.Transaction.prototype, "begin", () => assert.fail("No debe escribir"));
    const gerente = { UsuarioId: 7, Rol: "GERENTE" };
    const consultar = esExtras ? extras.getSolicitudById : permisos.obtenerPermisoPorId;
    await assert.rejects(consultar(20, gerente), { status: 404 });
    await assert.rejects(esExtras
      ? extras.resolverSolicitudHorasExtras(20, { estado: "RECHAZADA" }, gerente)
      : permisos.resolverPermiso(20, { estado: "RECHAZADA" }, gerente), { status: 404 });
  });
}

test("extras: conflicto de resolución y fallo de detalle revierten la transacción", async (t) => {
  const anterior = { SolicitudId: 11, RestauranteId: 2, FechaSolicitada: new Date("2099-06-15"), Estado: "PENDIENTE" };
  let conflicto = true;
  const eventos = [];
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      return { recordset: query.includes("FROM Usuarios") ? [{ RestauranteId: 2 }] : [anterior] };
    },
  }));
  t.mock.method(sql.Transaction.prototype, "begin", async () => eventos.push("begin"));
  t.mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
  t.mock.method(sql.Transaction.prototype, "commit", () => assert.fail("No debe confirmar"));
  t.mock.method(sql.Transaction.prototype, "request", () => {
    const parametros = {};
    return {
      input(name, type, value) { parametros[name] = value; return this; },
      async query(query) {
        if (query.includes("UPDATE s")) {
          eventos.push("cabecera");
          assert.match(query, /s.TipoSolicitud = 'HORAS_EXTRAS'[\s\S]*s.Estado = 'PENDIENTE'/);
          assert.match(query, /RevisadoPorRhId = NULL/);
          assert.equal(parametros.revisadoPorGerenteId, 7);
          return { recordset: conflicto ? [] : [{ SolicitudId: 11 }] };
        }
        assert.match(query, /UPDATE d SET MinutosAutorizados/);
        assert.equal(parametros.minutosAutorizados, 0);
        eventos.push("detalle");
        return { rowsAffected: [0] };
      },
    };
  });
  const resolver = () => extras.resolverSolicitudHorasExtras(11, { estado: "RECHAZADA" }, { UsuarioId: 7, Rol: "GERENTE" });
  await assert.rejects(resolver(), { status: 409 });
  assert.deepEqual(eventos, ["begin", "cabecera", "rollback"]);
  eventos.length = 0;
  conflicto = false;
  await assert.rejects(resolver(), { status: 500 });
  assert.deepEqual(eventos, ["begin", "cabecera", "detalle", "rollback"]);
});

test("extras vencidas actualizan cabecera y minutos juntos y revierten ante fallo", async (t) => {
  const eventos = [];
  const fallo = new Error("Fallo en detalle vencido");
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(sql.Transaction.prototype, "begin", async () => eventos.push("begin"));
  t.mock.method(sql.Transaction.prototype, "commit", () => assert.fail("No debe confirmar"));
  t.mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
  t.mock.method(sql.Transaction.prototype, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /OUTPUT INSERTED.SolicitudId INTO @Vencidas/);
      assert.match(query, /TipoSolicitud = 'HORAS_EXTRAS'/);
      assert.match(query, /UPDATE d SET MinutosAutorizados = 0/);
      assert.match(query, /INNER JOIN @Vencidas/);
      throw fallo;
    },
  }));
  await assert.rejects(extrasRepository.rechazarSolicitudesVencidas("2026-10-04", { colaboradorId: 4 }), error => error === fallo);
  assert.deepEqual(eventos, ["begin", "rollback"]);
});

test("permiso aprobado sigue bloqueando operaciones y conserva los bloqueos SQL", async (t) => {
  const transaction = new sql.Transaction(pool);
  t.mock.method(sql.Transaction.prototype, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /INNER JOIN dbo.Solicitudes/);
      assert.match(query, /WITH \(UPDLOCK, HOLDLOCK\)/);
      assert.match(query, /TipoSolicitud = 'PERMISO_LABORAL'/);
      return { recordset: [{ SolicitudId: 11, Estado: "APROBADA" }] };
    },
  }));
  await assert.rejects(permisos.validarDiaSinPermisoAprobado(4, "2026-10-04", transaction),
    { status: 400, message: "El colaborador ya tiene un permiso laboral aprobado para la fecha indicada" });
  // Los repositorios que reciben una transacción no la confirman por su cuenta.
  assert.equal((await permisosRepository.getPermisoByColaboradorYFecha(4, new Date("2026-10-04"), transaction)).SolicitudId, 11);
});
