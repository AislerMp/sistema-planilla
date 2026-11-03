import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
// Estas pruebas simulan SQL Server; no ejecutan la migración ni abren conexiones.
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
const extras = await import("../../src/modules/extras/horasExtras.service.js");
const permisos = await import("../../src/modules/permisosLaborales/permisosLaborales.service.js");
const extrasRepository = await import("../../src/modules/extras/horasExtras.repository.js");
const permisosRepository = await import("../../src/modules/permisosLaborales/permisosLaborales.repository.js");
for (const esExtras of [true, false]) {
  const tipo = esExtras ? "HORAS_EXTRAS" : "PERMISO_LABORAL";
  const tabla = esExtras ? "SolicitudesHorasExtras" : "PermisosLaborales";
  for (const caso of ["creada", "duplicada", "detalle falla", "bitácora falla"]) {
    test(`${tipo}: creación ${caso} mantiene cabecera y detalle juntos`, async () => {
      const eventos = [];
      const usuario = {
        UsuarioId: 7,
        ColaboradorId: 4,
        Rol: "COLABORADOR"
      };
      const datos = {
        fechaSolicitada: "2099-06-15",
        motivo: " Apoyo ñ ",
        minutosSolicitados: 60
      };
      const solicitud = {
        SolicitudId: 11,
        TipoSolicitud: tipo,
        ColaboradorId: 4,
        RestauranteId: 2,
        RegistradoPorUsuarioId: 7,
        FechaSolicitada: new Date(datos.fechaSolicitada),
        Motivo: "Apoyo ñ",
        Estado: "PENDIENTE",
        RevisadoPorGerenteId: null,
        RevisadoPorRhId: null,
        ...(esExtras ? {
          MinutosSolicitados: 60,
          MinutosAutorizados: null
        } : {})
      };
      const fallo = new Error(caso);
      let transaction;
      jest.spyOn(pool, "connect").mockImplementation(async () => pool);
      jest.spyOn(pool, "request").mockImplementation(() => ({
        input() {
          return this;
        },
        async query(query) {
          // Estos escenarios previos no tienen vacaciones superpuestas.
          if (query.includes("FROM dbo.Vacaciones")) return {
            recordset: []
          };
          expect(query).toMatch(/FROM Colaboradores/);
          return {
            recordset: [{
              ColaboradorId: 4,
              RestauranteId: 2,
              Activo: true
            }]
          };
        }
      }));
      jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async function () {
        transaction = this;
        eventos.push("begin");
      });
      jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => eventos.push("commit"));
      jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => eventos.push("rollback"));
      jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
        expect(this).toBe(transaction);
        const parametros = {};
        return {
          input(name, type, value) {
            parametros[name] = value;
            return this;
          },
          async query(query) {
            // Estos escenarios previos no tienen vacaciones superpuestas.
            if (query.includes("FROM dbo.Vacaciones")) return {
              recordset: []
            };
            if (query.includes("FROM dbo.Colaboradores")) {
              expect(query).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);
              expect(parametros.colaboradorId).toBe(usuario.ColaboradorId);
              eventos.push("bloquear");
              return {
                recordset: [{
                  ColaboradorId: 4
                }]
              };
            }
            if (query.includes("SELECT TOP (1)")) {
              expect(eventos.at(-1)).toBe("bloquear");
              expect(query).toMatch(new RegExp(`s.TipoSolicitud = '${tipo}'`));
              expect(query).toMatch(/d.FechaSolicitada = @fecha/);
              // Incluso un permiso rechazado impide crear otro para esa fecha.
              assert.doesNotMatch(query, /Estado = 'PENDIENTE'/);
              eventos.push("buscar");
              return {
                recordset: caso === "duplicada" ? [{
                  ...solicitud,
                  Estado: "RECHAZADA"
                }] : []
              };
            }
            if (query.includes("INSERT INTO dbo.Solicitudes (")) {
              eventos.push("cabecera");
              expect(parametros.tipoSolicitud).toBe(tipo);
              expect(parametros.registradoPorUsuarioId).toBe(usuario.UsuarioId);
              expect(parametros.motivo).toBe("Apoyo ñ");
              return {
                recordset: [{
                  SolicitudId: 11
                }]
              };
            }
            if (query.includes(`INSERT INTO dbo.${tabla}`)) {
              eventos.push("detalle");
              expect(parametros.solicitudId).toBe(11);
              if (esExtras) expect(query).toMatch(/s.TipoSolicitud = 'HORAS_EXTRAS'/);else expect(query).toMatch(/VALUES\s*\(@solicitudId, @fechaSolicitada\)/);
              if (caso === "detalle falla") throw fallo;
              return {
                rowsAffected: [1]
              };
            }
            if (query.includes("SELECT")) {
              eventos.push("leer");
              expect(query).toMatch(/s.SolicitudId = d.SolicitudId/);
              return {
                recordset: [solicitud]
              };
            }
            expect(query).toMatch(/INSERT INTO dbo.Bitacora/);
            eventos.push("bitacora");
            expect(parametros.Entidad).toBe("Solicitudes");
            expect(parametros.RegistroId).toBe(11);
            expect(JSON.parse(parametros.DatosNuevos).TipoSolicitud).toBe(tipo);
            if (caso === "bitácora falla") throw fallo;
            return {
              rowsAffected: [1]
            };
          }
        };
      });
      const crear = () => esExtras ? extras.crearSolicitudHorasExtras(usuario, datos) : permisos.solicitarPermiso(datos, usuario);
      if (caso === "creada") {
        expect(await crear()).toEqual(solicitud);
        expect(eventos).toEqual(["begin", "bloquear", "buscar", "cabecera", "detalle", "leer", "bitacora", "commit"]);
      } else {
        await assert.rejects(crear(), caso === "duplicada" ? {
          status: esExtras ? 409 : 400
        } : error => error === fallo);
        expect(eventos.at(-1)).toBe("rollback");
        expect(eventos.includes("commit")).toBe(false);
        if (caso === "duplicada") expect(eventos.includes("cabecera")).toBe(false);
      }
    });
  }
  test(`${tipo}: un ID de otro tipo no se consulta ni resuelve`, async () => {
    jest.spyOn(pool, "connect").mockImplementation(async () => pool);
    jest.spyOn(pool, "request").mockImplementation(() => ({
      input() {
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        expect(query).toMatch(/s.SolicitudId = @solicitudId/);
        expect(query).toMatch(new RegExp(`s.TipoSolicitud = '${tipo}'`));
        return {
          recordset: []
        };
      }
    }));
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(() => assert.fail("No debe escribir"));
    const gerente = {
      UsuarioId: 7,
      Rol: "GERENTE"
    };
    const consultar = esExtras ? extras.getSolicitudById : permisos.obtenerPermisoPorId;
    await assert.rejects(consultar(20, gerente), {
      status: 404
    });
    await assert.rejects(esExtras ? extras.resolverSolicitudHorasExtras(20, {
      estado: "RECHAZADA"
    }, gerente) : permisos.resolverPermiso(20, {
      estado: "RECHAZADA"
    }, gerente), {
      status: 404
    });
  });
}
test("extras: conflicto de resolución y fallo de detalle revierten la transacción", async () => {
  const anterior = {
    SolicitudId: 11,
    RestauranteId: 2,
    FechaSolicitada: new Date("2099-06-15"),
    Estado: "PENDIENTE"
  };
  let conflicto = true;
  const eventos = [];
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones")) return {
        recordset: []
      };
      return {
        recordset: query.includes("FROM Usuarios") ? [{
          RestauranteId: 2
        }] : [anterior]
      };
    }
  }));
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => eventos.push("begin"));
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => eventos.push("rollback"));
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(() => assert.fail("No debe confirmar"));
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => {
    const parametros = {};
    return {
      input(name, type, value) {
        parametros[name] = value;
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        if (query.includes("UPDATE s")) {
          eventos.push("cabecera");
          expect(query).toMatch(/s.TipoSolicitud = 'HORAS_EXTRAS'[\s\S]*s.Estado = 'PENDIENTE'/);
          expect(query).toMatch(/RevisadoPorRhId = NULL/);
          expect(parametros.revisadoPorGerenteId).toBe(7);
          return {
            recordset: conflicto ? [] : [{
              SolicitudId: 11
            }]
          };
        }
        expect(query).toMatch(/UPDATE d SET MinutosAutorizados/);
        expect(parametros.minutosAutorizados).toBe(0);
        eventos.push("detalle");
        return {
          rowsAffected: [0]
        };
      }
    };
  });
  const resolver = () => extras.resolverSolicitudHorasExtras(11, {
    estado: "RECHAZADA"
  }, {
    UsuarioId: 7,
    Rol: "GERENTE"
  });
  await assert.rejects(resolver(), {
    status: 409
  });
  expect(eventos).toEqual(["begin", "cabecera", "rollback"]);
  eventos.length = 0;
  conflicto = false;
  await assert.rejects(resolver(), {
    status: 500
  });
  expect(eventos).toEqual(["begin", "cabecera", "detalle", "rollback"]);
});
test("extras vencidas actualizan cabecera y minutos juntos y revierten ante fallo", async () => {
  const eventos = [];
  const fallo = new Error("Fallo en detalle vencido");
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => eventos.push("begin"));
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(() => assert.fail("No debe confirmar"));
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => eventos.push("rollback"));
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones")) return {
        recordset: []
      };
      expect(query).toMatch(/OUTPUT INSERTED.SolicitudId INTO @Vencidas/);
      expect(query).toMatch(/TipoSolicitud = 'HORAS_EXTRAS'/);
      expect(query).toMatch(/UPDATE d SET MinutosAutorizados = 0/);
      expect(query).toMatch(/INNER JOIN @Vencidas/);
      throw fallo;
    }
  }));
  await assert.rejects(extrasRepository.rechazarSolicitudesVencidas("2026-10-04", {
    colaboradorId: 4
  }), error => error === fallo);
  expect(eventos).toEqual(["begin", "rollback"]);
});
test("permiso aprobado sigue bloqueando operaciones y conserva los bloqueos SQL", async () => {
  const transaction = new sql.Transaction(pool);
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      // Estos escenarios previos no tienen vacaciones superpuestas.
      if (query.includes("FROM dbo.Vacaciones")) return {
        recordset: []
      };
      expect(query).toMatch(/INNER JOIN dbo.Solicitudes/);
      expect(query).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);
      expect(query).toMatch(/TipoSolicitud = 'PERMISO_LABORAL'/);
      return {
        recordset: [{
          SolicitudId: 11,
          Estado: "APROBADA"
        }]
      };
    }
  }));
  await assert.rejects(permisos.validarDiaSinPermisoAprobado(4, "2026-10-04", transaction), {
    status: 400,
    message: "El colaborador ya tiene un permiso laboral aprobado para la fecha indicada"
  });
  // Los repositorios que reciben una transacción no la confirman por su cuenta.
  expect((await permisosRepository.getPermisoByColaboradorYFecha(4, new Date("2026-10-04"), transaction)).SolicitudId).toBe(11);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
