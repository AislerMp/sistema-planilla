import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { resolverIncapacidadRh } = await import(
  "../src/modules/incapacidades/services/incapacidades.services.js"
);

const fecha = (texto) => new Date(`${texto}T00:00:00.000Z`);
const usuarioRh = { UsuarioId: 7, Rol: "RECURSOS_HUMANOS" };
const tipos = {
  MATERNIDAD_CCSS: { TipoIncapacidadId: 3, Codigo: "MATERNIDAD_CCSS", PorcentajePatronal: 50 },
  ENFERMEDAD_CCSS: { TipoIncapacidadId: 1, Codigo: "ENFERMEDAD_CCSS", PorcentajePatronal: 50 },
  RIESGO_TRABAJO_INS: { TipoIncapacidadId: 2, Codigo: "RIESGO_TRABAJO_INS", PorcentajePatronal: 0 },
};

// Simulación transaccional de SQL: begin crea una copia, commit la publica y
// rollback la descarta. Se ejecutan realmente todos los servicios/repositorios.
// Esto comprueba el flujo de la aplicación, no las garantías de SQL Server.
function preparar(t, opciones = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T18:00:00.000Z") });
  t.mock.method(console, "error", () => {});
  const tipo = tipos[opciones.codigo ?? "MATERNIDAD_CCSS"];
  const bd = {
    solicitud: opciones.sinSolicitud ? null : {
      SolicitudId: 41, TipoSolicitud: "INCAPACIDAD", ColaboradorId: 2018,
      RestauranteId: 2, RegistradoPorUsuarioId: 2, Estado: "EN_REVISION_RH",
      RevisadoPorGerenteId: 4, RevisadoPorRhId: null, Observacion: "Revisada por Gerencia",
      TipoIncapacidadId: tipo.TipoIncapacidadId,
      FechaInicio: fecha("2026-10-20"), FechaFin: fecha("2026-11-12"),
      ...opciones.solicitud,
    },
    saldo: opciones.sinSaldo ? null : {
      ColaboradorId: 2018, DiasAcumulados: 6, DiasUtilizados: 1,
      DiasDisponibles: 5, FechaAcumuladaHasta: fecha("2026-10-01"),
    },
    calculos: [], bitacoras: [],
  };
  const original = structuredClone(bd);
  const eventos = [];
  const fallo = new Error(`Fallo simulado: ${opciones.fallo}`);
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => assert.fail("La resolución debe compartir la transacción en todas las consultas"));
  t.mock.method(sql.Transaction.prototype, "begin", async function () {
    this.estadoSimulado = structuredClone(bd);
    eventos.push({ tipo: "begin", transaction: this });
  });
  t.mock.method(sql.Transaction.prototype, "commit", async function () {
    Object.assign(bd, structuredClone(this.estadoSimulado));
    eventos.push({ tipo: "commit", transaction: this });
  });
  t.mock.method(sql.Transaction.prototype, "rollback", async function () {
    delete this.estadoSimulado;
    eventos.push({ tipo: "rollback", transaction: this });
  });
  t.mock.method(sql.Transaction.prototype, "request", function () {
    const transaction = this;
    const parametros = {};
    return {
      input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
      async query(query) {
        const estado = transaction.estadoSimulado;
        const evento = (tipoEvento) => eventos.push({ tipo: tipoEvento, transaction, query, parametros });
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          evento("bloquear");
          if (opciones.cambioTrasBloqueo) {
            // Representa una resolución ajena que terminó antes de obtener el bloqueo.
            bd.solicitud.Estado = "APROBADA";
            estado.solicitud.Estado = "APROBADA";
          }
          return { recordset: [{ ColaboradorId: 2018 }] };
        }
        if (query.includes("UPDATE dbo.Solicitudes")) {
          evento("resolver");
          assert.match(query, /AND Estado = 'EN_REVISION_RH'/);
          assert.equal(parametros.tipoSolicitud, "INCAPACIDAD");
          if (opciones.updateVacio || estado.solicitud.Estado !== "EN_REVISION_RH") return { recordset: [] };
          Object.assign(estado.solicitud, {
            Estado: parametros.estado, RevisadoPorRhId: parametros.revisadoPorRhId,
            Observacion: parametros.observacion,
          });
          return { recordset: [{ ...estado.solicitud }] };
        }
        if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
          evento("insert-calculo");
          if (opciones.fallo === "segundo-insert" && estado.calculos.length === 1) throw fallo;
          assert.equal(estado.solicitud.Estado, "APROBADA");
          const registro = {
            CalculoId: estado.calculos.length + 1, SolicitudId: parametros.solicitudId,
            PeriodoId: parametros.periodoId, MinutosReconocidos: parametros.minutosReconocidos,
            PorcentajePatronalAplicado: parametros.porcentajePatronalAplicado,
          };
          estado.calculos.push(registro);
          return { recordset: [{ ...registro }] };
        }
        if (query.includes("FROM dbo.CalculosIncapacidad")) {
          evento("consultar-calculos");
          return { recordset: [...estado.calculos] };
        }
        if (query.includes("FROM dbo.Solicitudes AS s")) {
          evento("consultar-solicitud");
          return { recordset: estado.solicitud ? [{ ...estado.solicitud }] : [] };
        }
        if (query.includes("FROM dbo.TiposIncapacidad")) {
          evento("consultar-tipo");
          return { recordset: opciones.sinTipo ? [] : [{ ...tipo }] };
        }
        if (query.includes("FROM dbo.Incapacidades AS i")) {
          if (query.includes("i.FechaFin < @fechaInicio")) {
            evento("antecedentes-enfermedad");
            return { recordset: [] };
          }
          evento("consultar-anteriores");
          return { recordset: [{ ...estado.solicitud }] };
        }
        if (query.includes("FROM dbo.Vacaciones AS v")) {
          evento("validar-vacaciones");
          return { recordset: [] };
        }
        if (query.includes("FROM dbo.SaldosVacaciones")) {
          evento("consultar-saldo");
          return { recordset: estado.saldo ? [{ ...estado.saldo }] : [] };
        }
        if (query.includes("UPDATE dbo.SaldosVacaciones")) {
          evento("update-saldo");
          assert.doesNotMatch(query, /SET\s+DiasUtilizados/);
          estado.saldo.DiasAcumulados = parametros.diasAcumulados;
          estado.saldo.FechaAcumuladaHasta = parametros.fechaAcumuladaHasta;
          estado.saldo.DiasDisponibles = estado.saldo.DiasAcumulados - estado.saldo.DiasUtilizados;
          if (opciones.fallo === "saldo") throw fallo;
          return { recordset: [{ ...estado.saldo }] };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          evento("bitacora");
          estado.bitacoras.push({ ...parametros });
          if ((opciones.fallo === "bitacora-saldo" && parametros.Entidad === "SaldosVacaciones") ||
              (opciones.fallo === "bitacora-solicitud" && parametros.Entidad === "SolicitudesIncapacidades")) throw fallo;
          return { rowsAffected: [1] };
        }
        if (query.includes("FROM dbo.AsistenciasDiarias")) {
          evento("consultar-asistencia");
          return { recordset: [] };
        }
        if (query.includes("FROM dbo.PeriodosPlanilla")) {
          evento("consultar-periodo");
          const periodos = [
            [1, "2026-10-12", "2026-10-25", "ABIERTO"],
            [2, "2026-10-26", "2026-11-08", "PROGRAMADO"],
            [3, "2026-11-09", "2026-11-22", "PROGRAMADO"],
          ].map(([PeriodoId, desde, hasta, Estado]) => ({
            PeriodoId, FechaInicio: fecha(desde), FechaFin: fecha(hasta), Estado,
            FechaLimiteAjustes: fecha("2026-12-01"),
          }));
          return { recordset: periodos.filter((p) =>
            p.PeriodoId !== opciones.periodoFaltante &&
            p.FechaInicio <= parametros.FechaAsignada && p.FechaFin >= parametros.FechaAsignada,
          ) };
        }
        assert.fail(`Consulta SQL no simulada: ${query}`);
      },
    };
  });
  return {
    bd, original, eventos, fallo,
    resolver(estado = "APROBADA", usuario = usuarioRh) {
      return resolverIncapacidadRh(41, { estado, observacion: " Revisada por RH ", revisadoPorRhId: 999 }, usuario);
    },
  };
}

function comprobarRollback(prueba) {
  assert.equal(prueba.eventos.at(-1).tipo, "rollback");
  assert.equal(prueba.eventos.some((e) => e.tipo === "commit"), false);
  assert.deepEqual(prueba.bd, prueba.original, "Se descartan solicitud, cálculos, saldo y bitácoras de la transacción simulada");
}

test("solo RH puede resolver una incapacidad", async (t) => {
  const prueba = preparar(t);
  for (const Rol of ["COLABORADOR", "GERENTE", "ADMINISTRADOR"]) {
    await assert.rejects(prueba.resolver("APROBADA", { UsuarioId: 7, Rol }), { status: 403 });
  }
  assert.deepEqual(prueba.eventos, []);
});

test("RH recibe 404 si no existe la solicitud y revierte", async (t) => {
  const prueba = preparar(t, { sinSolicitud: true });
  await assert.rejects(prueba.resolver(), { status: 404 });
  comprobarRollback(prueba);
});

for (const Estado of ["PENDIENTE", "APROBADA", "RECHAZADA"]) {
  test(`RH solo puede resolver desde EN_REVISION_RH: bloquea ${Estado}`, async (t) => {
    const prueba = preparar(t, { solicitud: { Estado } });
    await assert.rejects(prueba.resolver(), { status: 409 });
    comprobarRollback(prueba);
  });
}

test("rechazar registra bitácora sin consultar tipo ni generar cálculos ni tocar vacaciones", async (t) => {
  const prueba = preparar(t, { sinTipo: true, sinSaldo: true });
  const resultado = await prueba.resolver("RECHAZADA");
  assert.equal(resultado.incapacidadActualizada.Estado, "RECHAZADA");
  assert.equal(resultado.registroCalculoCreado, null);
  assert.equal(prueba.bd.solicitud.RevisadoPorRhId, 7);
  assert.equal(prueba.bd.solicitud.Observacion, "Revisada por RH");
  assert.equal(prueba.bd.bitacoras.length, 1);
  assert.equal(prueba.bd.bitacoras[0].Accion, "RECHAZAR_INCAPACIDAD");
  assert.deepEqual(prueba.bd.calculos, []);
  assert.equal(prueba.bd.saldo, null);
  for (const tipo of ["consultar-tipo", "consultar-calculos", "insert-calculo", "consultar-saldo", "update-saldo", "consultar-periodo", "antecedentes-enfermedad"]) {
    assert.equal(prueba.eventos.some((e) => e.tipo === tipo), false);
  }
  assert.equal(prueba.eventos.at(-1).tipo, "commit");
});

test("aprobar maternidad usa su reconocimiento por períodos y comparte bloqueo y transacción", async (t) => {
  const prueba = preparar(t);
  const resultado = await prueba.resolver();
  assert.equal(resultado.incapacidadActualizada.Estado, "APROBADA");
  assert.equal(resultado.registroCalculoCreado.diasReconocidos, 24);
  assert.equal(resultado.registroCalculoCreado.minutosReconocidos, 5760);
  assert.deepEqual(prueba.bd.calculos.map((c) => c.MinutosReconocidos), [1440, 3360, 960]);
  assert.equal(prueba.bd.saldo.DiasAcumulados, 6.96);
  assert.equal(prueba.bd.saldo.DiasUtilizados, prueba.original.saldo.DiasUtilizados);
  assert.deepEqual(prueba.bd.saldo.FechaAcumuladaHasta, prueba.original.saldo.FechaAcumuladaHasta);
  assert.equal(prueba.eventos.some((e) => ["antecedentes-enfermedad", "consultar-anteriores"].includes(e.tipo)), false);
  assert.deepEqual(prueba.bd.bitacoras.map((b) => b.Accion), ["ACTUALIZAR", "APROBAR_INCAPACIDAD"]);
  assert.deepEqual(prueba.bd.bitacoras.map((b) => b.Entidad), ["SaldosVacaciones", "SolicitudesIncapacidades"]);
  const transaction = prueba.eventos[0].transaction;
  assert.ok(prueba.eventos.every((e) => e.transaction === transaction));
  const indiceBloqueo = prueba.eventos.findIndex((e) => e.tipo === "bloquear");
  const indiceSaldo = prueba.eventos.findIndex((e) => e.tipo === "consultar-saldo");
  assert.ok(indiceBloqueo > 0 && indiceBloqueo < indiceSaldo);
  assert.equal(prueba.eventos[indiceBloqueo + 1].tipo, "consultar-solicitud");
  assert.equal(prueba.eventos.at(-1).tipo, "commit");
});

for (const [codigo, minutos] of [["ENFERMEDAD_CCSS", 720], ["RIESGO_TRABAJO_INS", 0]]) {
  test(`${codigo} conserva su recorrido sin acreditar vacaciones ni repartir maternidad`, async (t) => {
    const prueba = preparar(t, { codigo });
    const resultado = await prueba.resolver();
    assert.equal(resultado.registroCalculoCreado.MinutosReconocidos, minutos);
    assert.equal(prueba.bd.calculos.length, 1);
    assert.equal(prueba.eventos.some((e) => e.tipo === "consultar-saldo" || e.tipo === "update-saldo"), false);
    assert.deepEqual(prueba.bd.saldo, prueba.original.saldo);
    assert.equal(prueba.eventos.filter((e) => e.tipo === "antecedentes-enfermedad").length, codigo === "ENFERMEDAD_CCSS" ? 1 : 0);
    assert.equal(prueba.bd.bitacoras.length, 1);
    assert.equal(prueba.bd.bitacoras[0].Accion, "APROBAR_INCAPACIDAD");
  });
}

for (const fallo of ["segundo-insert", "saldo", "bitacora-saldo", "bitacora-solicitud"]) {
  test(`fallo de ${fallo}: rollback total y propagación de la excepción original`, async (t) => {
    const prueba = preparar(t, { fallo });
    await assert.rejects(prueba.resolver(), (error) => error === prueba.fallo);
    comprobarRollback(prueba);
    assert.equal(prueba.eventos.filter((e) => e.tipo === "insert-calculo").length, fallo === "segundo-insert" ? 2 : 3);
  });
}

test("saldo inexistente revierte también el cambio de estado a aprobada", async (t) => {
  const prueba = preparar(t, { sinSaldo: true });
  await assert.rejects(prueba.resolver(), { status: 409 });
  comprobarRollback(prueba);
});

test("un período faltante revierte la aprobación y los tramos que ya se habían insertado", async (t) => {
  const prueba = preparar(t, { periodoFaltante: 2 });
  await assert.rejects(prueba.resolver(), { status: 409 });
  comprobarRollback(prueba);
  assert.equal(prueba.eventos.filter((e) => e.tipo === "insert-calculo").length, 1);
});

test("el UPDATE condicional vacío detecta una resolución concurrente", async (t) => {
  const prueba = preparar(t, { updateVacio: true });
  await assert.rejects(prueba.resolver(), { status: 409 });
  comprobarRollback(prueba);
  assert.equal(prueba.eventos.some((e) => ["insert-calculo", "update-saldo", "bitacora"].includes(e.tipo)), false);
});

test("la segunda lectura después del bloqueo detecta la resolución ajena sin sobrescribirla", async (t) => {
  const prueba = preparar(t, { cambioTrasBloqueo: true });
  await assert.rejects(prueba.resolver(), { status: 409 });
  assert.equal(prueba.bd.solicitud.Estado, "APROBADA");
  assert.deepEqual(prueba.bd.calculos, []);
  assert.deepEqual(prueba.bd.saldo, prueba.original.saldo);
  assert.equal(prueba.eventos.some((e) => e.tipo === "resolver"), false);
  assert.equal(prueba.eventos.at(-1).tipo, "rollback");
});

test("repetir una aprobación no duplica cálculos, saldo ni bitácoras", async (t) => {
  const prueba = preparar(t);
  await prueba.resolver();
  const aprobado = structuredClone(prueba.bd);
  await assert.rejects(prueba.resolver(), { status: 409 });
  assert.deepEqual(prueba.bd, aprobado);
  assert.equal(prueba.eventos.filter((e) => e.tipo === "commit").length, 1);
  assert.equal(prueba.eventos.at(-1).tipo, "rollback");
});
