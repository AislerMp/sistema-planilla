import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
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
const {
  acciones,
  entidades,
  listarBitacoras
} = await import("../../src/modules/bitacora/bitacora.service.js");
const {
  accionesBitacora,
  entidadesBitacora
} = await import("../../../client/src/constants/bitacora.js");

// Se simula el cálculo para aislar las pruebas de resolución. Los repositorios y la bitácora
// se ejecutan realmente contra requests SQL simulados, sin conectar a la BD.
const calculos = {
  registrar: async () => undefined
};
const calculosReales = await import("../../src/modules/vacaciones/services/calculosVacaciones.service.js");
jest.unstable_mockModule("../../src/modules/vacaciones/services/calculosVacaciones.service.js", () => ({
  registrarCalculoVacaciones: (...args) => calculos.registrar(...args)
}));
const vacaciones = await import("../../src/modules/vacaciones/services/vacaciones.service.js");
const usuarioRh = {
  UsuarioId: 7,
  Rol: "RECURSOS_HUMANOS"
};
const solicitudBase = {
  SolicitudId: 31,
  TipoSolicitud: "VACACIONES",
  ColaboradorId: 2018,
  RestauranteId: 2,
  RegistradoPorUsuarioId: 2,
  Estado: "EN_REVISION_RH",
  RevisadoPorGerenteId: 4,
  RevisadoPorRhId: null,
  Observacion: "Revisión del gerente",
  FechaInicio: new Date("2026-11-02"),
  FechaFin: new Date("2026-11-04"),
  DiasSolicitados: 3
};
const json = value => JSON.parse(JSON.stringify(value));
function prepararBD(opciones = {}) {
  const solicitud = opciones.solicitud === null ? null : {
    ...solicitudBase,
    ...opciones.solicitud
  };
  const eventos = [];
  const auditorias = [];
  const fallos = new Error("Fallo simulado");
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  for (const operacion of ["begin", "commit", "rollback"]) {
    jest.spyOn(sql.Transaction.prototype, operacion).mockImplementation(async function () {
      eventos.push({
        tipo: operacion,
        transaction: this
      });
      if (opciones.fallo === operacion) throw fallos;
    });
  }
  const request = (transaction = null) => {
    const parametros = {};
    return {
      input(nombre, _tipo, valor) {
        parametros[nombre] = valor;
        return this;
      },
      async query(query) {
        eventos.push({
          tipo: "query",
          query,
          parametros,
          transaction
        });
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
          recordset: [{
            ColaboradorId: 2018
          }]
        };
        if (query.includes("FROM Usuarios")) return {
          recordset: [{
            RestauranteId: 2
          }]
        };
        if (query.includes("SELECT * FROM Colaboradores")) return {
          recordset: [{
            ColaboradorId: 2018,
            RestauranteId: 2,
            Activo: true
          }]
        };
        if (query.includes("SELECT TOP (1) s.SolicitudId")) return {
          recordset: []
        };
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: opciones.anteriores ?? []
        };
        if (query.includes("FROM dbo.Incapacidades")) return { recordset: [] };
        if (query.includes("FROM dbo.Solicitudes AS s")) return {
          recordset: solicitud ? [{
            ...solicitud
          }] : []
        };
        if (query.includes("FROM dbo.SaldosVacaciones")) return {
          recordset: opciones.sinSaldo ? [] : [{
            DiasUtilizados: 0,
            DiasDisponibles: opciones.disponibles ?? 10
          }]
        };
        if (query.includes("UPDATE dbo.SaldosVacaciones")) return {
          recordset: [{ ColaboradorId: 2018, DiasUtilizados: parametros.diasUtilizados }]
        };
        if (query.includes("INSERT INTO dbo.Solicitudes")) return {
          recordset: [{
            SolicitudId: 31
          }]
        };
        if (query.includes("INSERT INTO dbo.Vacaciones")) return {
          recordset: [],
          rowsAffected: [1]
        };
        if (query.includes("UPDATE dbo.Solicitudes")) {
          expect(parametros.tipoSolicitud).toBe("VACACIONES");
          if (opciones.conflicto) return {
            recordset: []
          };
          return {
            recordset: [{
              SolicitudId: 31,
              TipoSolicitud: "VACACIONES",
              Estado: parametros.estado,
              Observacion: parametros.observacion,
              RevisadoPorGerenteId: parametros.revisadoPorGerenteId ?? 4,
              RevisadoPorRhId: parametros.revisadoPorRhId ?? null
            }]
          };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          if (opciones.fallo === "bitacora") throw fallos;
          auditorias.push({
            parametros,
            transaction
          });
          return {
            rowsAffected: [opciones.sinBitacora ? 0 : 1]
          };
        }
        throw new Error(`Consulta no simulada: ${query}`);
      }
    };
  };
  jest.spyOn(pool, "request").mockImplementation(() => request());
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    return request(this);
  });
  const calculo = [{
    CalculoVacacionId: 9,
    SolicitudId: 31,
    DiasReconocidos: 3,
    MinutosReconocidos: 1440
  }];
  const registrar = jest.spyOn(calculos, "registrar").mockImplementation(async (vacacion, transaction, actor) => {
    expect(vacacion.Estado).toBe("APROBADA");
    expect(vacacion.DiasSolicitados).toBe(3);
    expect(actor).toBe(7);
    expect(transaction).toBe(eventos.find(e => e.tipo === "begin").transaction);
    if (opciones.fallo === "calculo") throw fallos;
    return opciones.calculoVacio ? [] : calculo;
  });
  return {
    solicitud,
    eventos,
    auditorias,
    registrar,
    fallos,
    calculo
  };
}
for (const estado of ["APROBADA", "RECHAZADA"]) {
  test(`RH ${estado}: registra vacaciones, estado anterior/nuevo y cálculo simulado en la misma transacción`, async () => {
    const bd = prepararBD();
    const resultado = await vacaciones.resolverVacacionesRH("31", {
      estado: ` ${estado.toLowerCase()} `,
      observacion: " Revisado por RH ",
      revisadoPorRhId: 999
    }, usuarioRh);
    expect(resultado.vacacionActualizada.Estado).toBe(estado);
    expect(resultado.registroCalculoCreado).toBe(estado === "APROBADA" ? bd.calculo : null);
    expect(bd.registrar.mock.calls.length).toBe(estado === "APROBADA" ? 1 : 0);
    expect(bd.auditorias.length).toBe(1);
    const {
      parametros: p,
      transaction
    } = bd.auditorias[0];
    expect(p.Entidad).toBe("Vacaciones");
    expect(p.Accion).toBe(estado === "APROBADA" ? "APROBAR_VACACIONES" : "RECHAZAR_VACACIONES");
    expect(p.UsuarioId).toBe(7);
    expect(p.RegistroId).toBe(31);
    expect(JSON.parse(p.DatosAnteriores)).toEqual(json(bd.solicitud));
    expect(JSON.parse(p.DatosNuevos)).toEqual(json({
      ...bd.solicitud,
      ...resultado.vacacionActualizada,
      registroCalculoCreado: resultado.registroCalculoCreado
    }));
    expect(resultado.vacacionActualizada.Observacion).toBe("Revisado por RH");
    expect(transaction).toBe(bd.eventos.find(e => e.tipo === "begin").transaction);
    expect(transaction).toBe(bd.eventos.find(e => e.query?.includes("UPDATE dbo.Solicitudes")).transaction);
    expect(bd.eventos.at(-1).tipo).toBe("commit");
    expect(bd.eventos.some(e => e.tipo === "rollback")).toBe(false);
    if (estado === "RECHAZADA") expect(bd.eventos.some(e => e.query?.includes("FROM dbo.SaldosVacaciones"))).toBe(false);
  });
}
for (const caso of [{
  nombre: "sin solicitud",
  solicitud: null,
  status: 404
}, {
  nombre: "ya resuelta",
  solicitud: {
    Estado: "APROBADA"
  },
  status: 409
}, {
  nombre: "sin saldo",
  sinSaldo: true,
  status: 409
}, {
  nombre: "saldo insuficiente",
  disponibles: 2,
  status: 409
}, {
  nombre: "actualización concurrente",
  conflicto: true,
  status: 409
}, {
  nombre: "resultado de cálculo vacío",
  calculoVacio: true,
  status: 500
}, {
  nombre: "solicitud anterior pendiente",
  anteriores: [{
    SolicitudId: 30,
    Estado: "PENDIENTE",
    FechaInicio: new Date("2026-10-20")
  }],
  status: 409
}]) {
  test(`RH revierte ${caso.nombre} sin registrar éxito`, async () => {
    const bd = prepararBD(caso);
    await assert.rejects(vacaciones.resolverVacacionesRH(31, {
      estado: "APROBADA"
    }, usuarioRh), {
      status: caso.status
    });
    expect(bd.auditorias.length).toBe(0);
    expect(bd.eventos.at(-1).tipo).toBe("rollback");
    expect(bd.eventos.some(e => e.tipo === "commit")).toBe(false);
  });
}
for (const fallo of ["calculo", "bitacora", "commit"]) {
  test(`RH propaga fallo de ${fallo} y revierte la resolución`, async () => {
    const bd = prepararBD({
      fallo
    });
    await assert.rejects(vacaciones.resolverVacacionesRH(31, {
      estado: "APROBADA"
    }, usuarioRh), error => error === bd.fallos);
    expect(bd.eventos.at(-1).tipo).toBe("rollback");
  });
}
test("RH revierte cuando la inserción de bitácora no afecta filas", async () => {
  const bd = prepararBD({
    sinBitacora: true
  });
  await assert.rejects(vacaciones.resolverVacacionesRH(31, {
    estado: "RECHAZADA"
  }, usuarioRh), {
    status: 500
  });
  expect(bd.eventos.at(-1).tipo).toBe("rollback");
  expect(bd.eventos.some(e => e.tipo === "commit")).toBe(false);
});
test("valida rol, estado e IDs antes de abrir la transacción", async () => {
  const bd = prepararBD();
  for (const Rol of ["ADMINISTRADOR", "GERENTE", "COLABORADOR"]) {
    await assert.rejects(vacaciones.resolverVacacionesRH(31, {
      estado: "APROBADA"
    }, {
      UsuarioId: 7,
      Rol
    }), {
      status: 403
    });
  }
  await assert.rejects(vacaciones.resolverVacacionesRH(0, {
    estado: "APROBADA"
  }, usuarioRh), {
    status: 400
  });
  await assert.rejects(vacaciones.resolverVacacionesRH(31, {
    estado: "PENDIENTE"
  }, usuarioRh), {
    status: 400
  });
  expect(bd.eventos.length).toBe(0);
});
for (const estado of ["EN_REVISION_RH", "RECHAZADA"]) {
  test(`gerente ${estado}: entidad y acción de vacaciones con los datos completos`, async () => {
    const bd = prepararBD({
      solicitud: {
        Estado: "PENDIENTE"
      }
    });
    const resultado = await vacaciones.revisarVacacionesGerente(31, {
      estado,
      observacion: " Revisado "
    }, {
      UsuarioId: 4,
      Rol: "GERENTE"
    });
    const {
      parametros: p,
      transaction
    } = bd.auditorias[0];
    expect(p.Entidad).toBe("Vacaciones");
    expect(p.Accion).toBe(estado === "EN_REVISION_RH" ? "APROBAR_REVISION_VACACIONES" : "RECHAZAR_VACACIONES");
    expect(p.UsuarioId).toBe(4);
    expect(p.RegistroId).toBe(31);
    expect(JSON.parse(p.DatosAnteriores)).toEqual(json(bd.solicitud));
    expect(JSON.parse(p.DatosNuevos)).toEqual(json({
      ...bd.solicitud,
      ...resultado
    }));
    expect(transaction).toBe(bd.eventos.find(e => e.tipo === "begin").transaction);
    expect(bd.eventos.at(-1).tipo).toBe("commit");
  });
}
test("crear vacaciones usa Vacaciones, CREAR y el ID generado", async () => {
  jest.useFakeTimers({
    now: new Date("2026-10-16T18:00:00Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  const bd = prepararBD({
    solicitud: {
      Estado: "PENDIENTE"
    }
  });
  const resultado = await vacaciones.solicitarVacaciones({
    fechaInicio: "2026-11-02",
    fechaFin: "2026-11-04",
    motivo: "Descanso"
  }, {
    UsuarioId: 2,
    ColaboradorId: 2018
  });
  const {
    parametros: p
  } = bd.auditorias[0];
  expect(resultado.SolicitudId).toBe(31);
  expect(p.Entidad).toBe("Vacaciones");
  expect(p.Accion).toBe("CREAR");
  expect(p.RegistroId).toBe(31);
  expect(p.UsuarioId).toBe(2);
  expect(p.DatosAnteriores).toBe(null);
  expect(bd.eventos.at(-1).tipo).toBe("commit");
});
test("catálogos de vacaciones coinciden entre backend y frontend y permiten filtrar bitácoras", async () => {
  for (const clave of ["VACACIONES", "SALDOS_VACACIONES"]) expect(entidadesBitacora[clave]).toBe(entidades[clave]);
  for (const clave of ["APROBAR_REVISION_VACACIONES", "APROBAR_VACACIONES", "RECHAZAR_VACACIONES"]) {
    expect(accionesBitacora[clave]).toBe(acciones[clave]);
  }
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query() {
      return {
        recordsets: [[{
          Total: 0
        }], []]
      };
    }
  }));
  for (const accion of [acciones.APROBAR_REVISION_VACACIONES, acciones.APROBAR_VACACIONES, acciones.RECHAZAR_VACACIONES]) {
    expect((await listarBitacoras({
      entidad: entidades.VACACIONES,
      accion
    })).total).toBe(0);
  }
});
test("el cálculo real exige la transacción de RH antes de consultar la base", async () => {
  const moduloReal = calculosReales;
  await assert.rejects(moduloReal.registrarCalculoVacaciones(solicitudBase, null, 7), {
    status: 500
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
