import { clonar } from "../support/clonar.js";
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
  resolverIncapacidadRh
} = await import("../../src/modules/incapacidades/services/incapacidades.services.js");
const fecha = texto => new Date(`${texto}T00:00:00.000Z`);
const usuarioRh = {
  UsuarioId: 7,
  Rol: "RECURSOS_HUMANOS"
};
const tipos = {
  MATERNIDAD_CCSS: {
    TipoIncapacidadId: 3,
    Codigo: "MATERNIDAD_CCSS",
    PorcentajePatronal: 50
  },
  ENFERMEDAD_CCSS: {
    TipoIncapacidadId: 1,
    Codigo: "ENFERMEDAD_CCSS",
    PorcentajePatronal: 50
  },
  RIESGO_TRABAJO_INS: {
    TipoIncapacidadId: 2,
    Codigo: "RIESGO_TRABAJO_INS",
    PorcentajePatronal: 0
  }
};

// Simulación transaccional de SQL: begin crea una copia, commit la publica y
// rollback la descarta. Se ejecutan realmente todos los servicios/repositorios.
// Esto comprueba el flujo de la aplicación, no las garantías de SQL Server.
function preparar(opciones = {}) {
  jest.useFakeTimers({
    now: new Date("2026-10-20T18:00:00.000Z"),
    doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  const tipo = tipos[opciones.codigo ?? "MATERNIDAD_CCSS"];
  const bd = {
    solicitud: opciones.sinSolicitud ? null : {
      SolicitudId: 41,
      TipoSolicitud: "INCAPACIDAD",
      ColaboradorId: 2018,
      RestauranteId: 2,
      RegistradoPorUsuarioId: 2,
      Estado: "EN_REVISION_RH",
      RevisadoPorGerenteId: 4,
      RevisadoPorRhId: null,
      Observacion: "Revisada por Gerencia",
      TipoIncapacidadId: tipo.TipoIncapacidadId,
      FechaInicio: fecha("2026-10-20"),
      FechaFin: fecha("2026-11-12"),
      ...opciones.solicitud
    },
    saldo: opciones.sinSaldo ? null : {
      ColaboradorId: 2018,
      DiasAcumulados: 6,
      DiasUtilizados: 1,
      DiasDisponibles: 5,
      FechaAcumuladaHasta: fecha("2026-10-01")
    },
    calculos: [],
    bitacoras: []
  };
  const original = clonar(bd);
  const eventos = [];
  const fallo = new Error(`Fallo simulado: ${opciones.fallo}`);
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => assert.fail("La resolución debe compartir la transacción en todas las consultas"));
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async function () {
    this.estadoSimulado = clonar(bd);
    eventos.push({
      tipo: "begin",
      transaction: this
    });
  });
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async function () {
    Object.assign(bd, clonar(this.estadoSimulado));
    eventos.push({
      tipo: "commit",
      transaction: this
    });
  });
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async function () {
    delete this.estadoSimulado;
    eventos.push({
      tipo: "rollback",
      transaction: this
    });
  });
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    const transaction = this;
    const parametros = {};
    return {
      input(nombre, _tipo, valor) {
        parametros[nombre] = valor;
        return this;
      },
      async query(query) {
        const estado = transaction.estadoSimulado;
        const evento = tipoEvento => eventos.push({
          tipo: tipoEvento,
          transaction,
          query,
          parametros
        });
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          evento("bloquear");
          if (opciones.cambioTrasBloqueo) {
            // Representa una resolución ajena que terminó antes de obtener el bloqueo.
            bd.solicitud.Estado = "APROBADA";
            estado.solicitud.Estado = "APROBADA";
          }
          return {
            recordset: [{
              ColaboradorId: 2018
            }]
          };
        }
        if (query.includes("UPDATE dbo.Solicitudes")) {
          evento("resolver");
          expect(query).toMatch(/AND Estado = 'EN_REVISION_RH'/);
          expect(parametros.tipoSolicitud).toBe("INCAPACIDAD");
          if (opciones.updateVacio || estado.solicitud.Estado !== "EN_REVISION_RH") return {
            recordset: []
          };
          Object.assign(estado.solicitud, {
            Estado: parametros.estado,
            RevisadoPorRhId: parametros.revisadoPorRhId,
            Observacion: parametros.observacion
          });
          return {
            recordset: [{
              ...estado.solicitud
            }]
          };
        }
        if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
          evento("insert-calculo");
          if (opciones.fallo === "segundo-insert" && estado.calculos.length === 1) throw fallo;
          expect(estado.solicitud.Estado).toBe("APROBADA");
          const registro = {
            CalculoId: estado.calculos.length + 1,
            SolicitudId: parametros.solicitudId,
            PeriodoId: parametros.periodoId,
            MinutosReconocidos: parametros.minutosReconocidos,
            PorcentajePatronalAplicado: parametros.porcentajePatronalAplicado
          };
          estado.calculos.push(registro);
          return {
            recordset: [{
              ...registro
            }]
          };
        }
        if (query.includes("FROM dbo.CalculosIncapacidad")) {
          evento("consultar-calculos");
          return {
            recordset: [...estado.calculos]
          };
        }
        if (query.includes("FROM dbo.Solicitudes AS s")) {
          evento("consultar-solicitud");
          return {
            recordset: estado.solicitud ? [{
              ...estado.solicitud
            }] : []
          };
        }
        if (query.includes("FROM dbo.TiposIncapacidad")) {
          evento("consultar-tipo");
          return {
            recordset: opciones.sinTipo ? [] : [{
              ...tipo
            }]
          };
        }
        if (query.includes("FROM dbo.Incapacidades AS i")) {
          if (query.includes("i.FechaFin < @fechaInicio")) {
            evento("antecedentes-enfermedad");
            return {
              recordset: []
            };
          }
          evento("consultar-anteriores");
          return {
            recordset: [{
              ...estado.solicitud
            }]
          };
        }
        if (query.includes("FROM dbo.Vacaciones AS v")) {
          evento("validar-vacaciones");
          return {
            recordset: []
          };
        }
        if (query.includes("FROM dbo.SaldosVacaciones")) {
          evento("consultar-saldo");
          return {
            recordset: estado.saldo ? [{
              ...estado.saldo
            }] : []
          };
        }
        if (query.includes("UPDATE dbo.SaldosVacaciones")) {
          evento("update-saldo");
          assert.doesNotMatch(query, /SET\s+DiasUtilizados/);
          estado.saldo.DiasAcumulados = parametros.diasAcumulados;
          estado.saldo.FechaAcumuladaHasta = parametros.fechaAcumuladaHasta;
          estado.saldo.DiasDisponibles = estado.saldo.DiasAcumulados - estado.saldo.DiasUtilizados;
          if (opciones.fallo === "saldo") throw fallo;
          return {
            recordset: [{
              ...estado.saldo
            }]
          };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          evento("bitacora");
          estado.bitacoras.push({
            ...parametros
          });
          if (opciones.fallo === "bitacora-saldo" && parametros.Entidad === "SaldosVacaciones" || opciones.fallo === "bitacora-solicitud" && parametros.Entidad === "SolicitudesIncapacidades") throw fallo;
          return {
            rowsAffected: [1]
          };
        }
        if (query.includes("FROM dbo.AsistenciasDiarias")) {
          evento("consultar-asistencia");
          return {
            recordset: []
          };
        }
        if (query.includes("FROM dbo.PeriodosPlanilla")) {
          evento("consultar-periodo");
          const periodos = [[1, "2026-10-12", "2026-10-25", "ABIERTO"], [2, "2026-10-26", "2026-11-08", "PROGRAMADO"], [3, "2026-11-09", "2026-11-22", "PROGRAMADO"]].map(([PeriodoId, desde, hasta, Estado]) => ({
            PeriodoId,
            FechaInicio: fecha(desde),
            FechaFin: fecha(hasta),
            Estado,
            FechaLimiteAjustes: fecha("2026-12-01")
          }));
          return {
            recordset: periodos.filter(p => p.PeriodoId !== opciones.periodoFaltante && p.FechaInicio <= parametros.FechaAsignada && p.FechaFin >= parametros.FechaAsignada)
          };
        }
        assert.fail(`Consulta SQL no simulada: ${query}`);
      }
    };
  });
  return {
    bd,
    original,
    eventos,
    fallo,
    resolver(estado = "APROBADA", usuario = usuarioRh) {
      return resolverIncapacidadRh(41, {
        estado,
        observacion: " Revisada por RH ",
        revisadoPorRhId: 999
      }, usuario);
    }
  };
}
function comprobarRollback(prueba) {
  expect(prueba.eventos.at(-1).tipo).toBe("rollback");
  expect(prueba.eventos.some(e => e.tipo === "commit")).toBe(false);
  assert.deepEqual(prueba.bd, prueba.original, "Se descartan solicitud, cálculos, saldo y bitácoras de la transacción simulada");
}
test("solo RH puede resolver una incapacidad", async () => {
  const prueba = preparar();
  for (const Rol of ["COLABORADOR", "GERENTE", "ADMINISTRADOR"]) {
    await assert.rejects(prueba.resolver("APROBADA", {
      UsuarioId: 7,
      Rol
    }), {
      status: 403
    });
  }
  expect(prueba.eventos).toEqual([]);
});
test("RH recibe 404 si no existe la solicitud y revierte", async () => {
  const prueba = preparar({
    sinSolicitud: true
  });
  await assert.rejects(prueba.resolver(), {
    status: 404
  });
  comprobarRollback(prueba);
});
for (const Estado of ["PENDIENTE", "APROBADA", "RECHAZADA"]) {
  test(`RH solo puede resolver desde EN_REVISION_RH: bloquea ${Estado}`, async () => {
    const prueba = preparar({
      solicitud: {
        Estado
      }
    });
    await assert.rejects(prueba.resolver(), {
      status: 409
    });
    comprobarRollback(prueba);
  });
}
test("rechazar registra bitácora sin consultar tipo ni generar cálculos ni tocar vacaciones", async () => {
  const prueba = preparar({
    sinTipo: true,
    sinSaldo: true
  });
  const resultado = await prueba.resolver("RECHAZADA");
  expect(resultado.incapacidadActualizada.Estado).toBe("RECHAZADA");
  expect(resultado.registroCalculoCreado).toBe(null);
  expect(prueba.bd.solicitud.RevisadoPorRhId).toBe(7);
  expect(prueba.bd.solicitud.Observacion).toBe("Revisada por RH");
  expect(prueba.bd.bitacoras.length).toBe(1);
  expect(prueba.bd.bitacoras[0].Accion).toBe("RECHAZAR_INCAPACIDAD");
  expect(prueba.bd.calculos).toEqual([]);
  expect(prueba.bd.saldo).toBe(null);
  for (const tipo of ["consultar-tipo", "consultar-calculos", "insert-calculo", "consultar-saldo", "update-saldo", "consultar-periodo", "antecedentes-enfermedad"]) {
    expect(prueba.eventos.some(e => e.tipo === tipo)).toBe(false);
  }
  expect(prueba.eventos.at(-1).tipo).toBe("commit");
});
test("aprobar maternidad usa su reconocimiento por períodos y comparte bloqueo y transacción", async () => {
  const prueba = preparar();
  const resultado = await prueba.resolver();
  expect(resultado.incapacidadActualizada.Estado).toBe("APROBADA");
  expect(resultado.registroCalculoCreado.diasReconocidos).toBe(24);
  expect(resultado.registroCalculoCreado.minutosReconocidos).toBe(5760);
  expect(prueba.bd.calculos.map(c => c.MinutosReconocidos)).toEqual([1440, 3360, 960]);
  expect(prueba.bd.saldo.DiasAcumulados).toBe(6.96);
  expect(prueba.bd.saldo.DiasUtilizados).toBe(prueba.original.saldo.DiasUtilizados);
  expect(prueba.bd.saldo.FechaAcumuladaHasta).toEqual(prueba.original.saldo.FechaAcumuladaHasta);
  expect(prueba.eventos.some(e => ["antecedentes-enfermedad", "consultar-anteriores"].includes(e.tipo))).toBe(false);
  expect(prueba.bd.bitacoras.map(b => b.Accion)).toEqual(["ACTUALIZAR", "APROBAR_INCAPACIDAD"]);
  expect(prueba.bd.bitacoras.map(b => b.Entidad)).toEqual(["SaldosVacaciones", "SolicitudesIncapacidades"]);
  const transaction = prueba.eventos[0].transaction;
  expect(prueba.eventos.every(e => e.transaction === transaction)).toBeTruthy();
  const indiceBloqueo = prueba.eventos.findIndex(e => e.tipo === "bloquear");
  const indiceSaldo = prueba.eventos.findIndex(e => e.tipo === "consultar-saldo");
  expect(indiceBloqueo > 0 && indiceBloqueo < indiceSaldo).toBeTruthy();
  expect(prueba.eventos[indiceBloqueo + 1].tipo).toBe("consultar-solicitud");
  expect(prueba.eventos.at(-1).tipo).toBe("commit");
});
for (const [codigo, minutos] of [["ENFERMEDAD_CCSS", 720], ["RIESGO_TRABAJO_INS", 0]]) {
  test(`${codigo} conserva su recorrido sin acreditar vacaciones ni repartir maternidad`, async () => {
    const prueba = preparar({
      codigo
    });
    const resultado = await prueba.resolver();
    expect(resultado.registroCalculoCreado.MinutosReconocidos).toBe(minutos);
    expect(prueba.bd.calculos.length).toBe(1);
    expect(prueba.eventos.some(e => e.tipo === "consultar-saldo" || e.tipo === "update-saldo")).toBe(false);
    expect(prueba.bd.saldo).toEqual(prueba.original.saldo);
    expect(prueba.eventos.filter(e => e.tipo === "antecedentes-enfermedad").length).toBe(codigo === "ENFERMEDAD_CCSS" ? 1 : 0);
    expect(prueba.bd.bitacoras.length).toBe(1);
    expect(prueba.bd.bitacoras[0].Accion).toBe("APROBAR_INCAPACIDAD");
  });
}
for (const fallo of ["segundo-insert", "saldo", "bitacora-saldo", "bitacora-solicitud"]) {
  test(`fallo de ${fallo}: rollback total y propagación de la excepción original`, async () => {
    const prueba = preparar({
      fallo
    });
    await assert.rejects(prueba.resolver(), error => error === prueba.fallo);
    comprobarRollback(prueba);
    expect(prueba.eventos.filter(e => e.tipo === "insert-calculo").length).toBe(fallo === "segundo-insert" ? 2 : 3);
  });
}
test("saldo inexistente revierte también el cambio de estado a aprobada", async () => {
  const prueba = preparar({
    sinSaldo: true
  });
  await assert.rejects(prueba.resolver(), {
    status: 409
  });
  comprobarRollback(prueba);
});
test("un período faltante revierte la aprobación y los tramos que ya se habían insertado", async () => {
  const prueba = preparar({
    periodoFaltante: 2
  });
  await assert.rejects(prueba.resolver(), {
    status: 409
  });
  comprobarRollback(prueba);
  expect(prueba.eventos.filter(e => e.tipo === "insert-calculo").length).toBe(1);
});
test("el UPDATE condicional vacío detecta una resolución concurrente", async () => {
  const prueba = preparar({
    updateVacio: true
  });
  await assert.rejects(prueba.resolver(), {
    status: 409
  });
  comprobarRollback(prueba);
  expect(prueba.eventos.some(e => ["insert-calculo", "update-saldo", "bitacora"].includes(e.tipo))).toBe(false);
});
test("la segunda lectura después del bloqueo detecta la resolución ajena sin sobrescribirla", async () => {
  const prueba = preparar({
    cambioTrasBloqueo: true
  });
  await assert.rejects(prueba.resolver(), {
    status: 409
  });
  expect(prueba.bd.solicitud.Estado).toBe("APROBADA");
  expect(prueba.bd.calculos).toEqual([]);
  expect(prueba.bd.saldo).toEqual(prueba.original.saldo);
  expect(prueba.eventos.some(e => e.tipo === "resolver")).toBe(false);
  expect(prueba.eventos.at(-1).tipo).toBe("rollback");
});
test("repetir una aprobación no duplica cálculos, saldo ni bitácoras", async () => {
  const prueba = preparar();
  await prueba.resolver();
  const aprobado = clonar(prueba.bd);
  await assert.rejects(prueba.resolver(), {
    status: 409
  });
  expect(prueba.bd).toEqual(aprobado);
  expect(prueba.eventos.filter(e => e.tipo === "commit").length).toBe(1);
  expect(prueba.eventos.at(-1).tipo).toBe("rollback");
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

