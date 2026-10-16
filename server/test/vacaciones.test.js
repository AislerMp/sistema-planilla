import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as siguienteTurno } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

// Estas pruebas nunca usan server/.env ni se conectan a SQL Server.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const saldos = await import("../src/modules/vacaciones/services/saldosVacaciones.service.js");
const fechas = await import("../src/shared/utils/fechaUtils.js");
const repositorio = await import("../src/modules/vacaciones/repositorios/saldosVacaciones.repository.js");

const fecha = (texto) => new Date(`${texto}T00:00:00Z`);
const saldoBase = (id = 1) => ({
  ColaboradorId: id, DiasAcumulados: 1.10, DiasUtilizados: 0.50,
  DiasDisponibles: 0.60, FechaAcumuladaHasta: fecha("2026-10-01"),
});
const asistencia = (dia, minutos, id = 1) => ({
  ColaboradorId: id, FechaAsignada: fecha(dia), MinutosEfectivos: minutos,
});
const incapacidad = (desde, hasta, estado = "APROBADA", id = 1) => ({
  ColaboradorId: id, FechaInicio: fecha(desde), FechaFin: fecha(hasta), Estado: estado,
});
const permiso = (dia, estado = "APROBADA", id = 1) => ({
  ColaboradorId: id, FechaSolicitada: fecha(dia), Estado: estado,
});

// Resultados de repositorios simulados y escrituras pendientes por transacción.
// No interpreta SQL: registra consultas y parámetros para comprobar el contrato.
function prepararBD(t, opciones = {}) {
  const saldosActuales = new Map((opciones.saldos ?? [saldoBase()]).map((s) => [s.ColaboradorId, s]));
  const eventos = [];
  const auditorias = [];
  const pendientes = new Map();
  const controles = {};
  const colaboradores = opciones.colaboradores ?? [{ ColaboradorId: 1 }];
  const errorOriginal = new Error("Fallo original de acumulación");
  const operaciones = (tipo) => eventos.filter((e) => e.tipo === tipo);
  t.mock.method(console, "error", () => {});
  t.mock.method(pool, "connect", async () => pool);

  function anotar(tipo, transaction, parametros = {}, query = "") {
    const evento = { tipo, transaction, parametros, query };
    eventos.push(evento);
    return evento;
  }
  function provocar(tipo, id) {
    const fallo = controles[tipo];
    if (fallo === true || (fallo instanceof Set && fallo.has(id))) throw errorOriginal;
  }
  t.mock.method(sql.Transaction.prototype, "begin", async function () {
    anotar("begin", this);
    pendientes.set(this, new Map());
    const numero = operaciones("begin").length;
    if (controles.falloBegin === true || controles.falloBegin === numero) throw errorOriginal;
  });
  t.mock.method(sql.Transaction.prototype, "commit", async function () {
    const id = operaciones("bloquear").findLast((e) => e.transaction === this)?.parametros.colaboradorid;
    anotar("commit-intento", this);
    if (controles.esperarCommit) await controles.esperarCommit;
    provocar("falloCommit", id);
    for (const [colaboradorId, nuevo] of pendientes.get(this) ?? []) saldosActuales.set(colaboradorId, nuevo);
    pendientes.delete(this);
    anotar("commit", this);
  });
  t.mock.method(sql.Transaction.prototype, "rollback", async function () {
    anotar("rollback", this);
    pendientes.delete(this);
    if (controles.falloRollback) throw new Error("Fallo de rollback");
  });

  function request(transaction = null) {
    const parametros = {};
    const tipos = {};
    return {
      input(nombre, tipo, valor) { parametros[nombre.toLowerCase()] = valor; tipos[nombre.toLowerCase()] = tipo; return this; },
      async query(query) {
        const p = parametros;
        const id = p.colaboradorid;
        if (query.includes("INNER JOIN dbo.SaldosVacaciones")) {
          anotar("lista", transaction, p, query);
          if (controles.esperarLista) await controles.esperarLista;
          provocar("falloLista");
          return { recordset: colaboradores };
        }
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          anotar("bloquear", transaction, p, query);
          return { recordset: [{ ColaboradorId: id }] };
        }
        if (query.includes("FROM dbo.SaldosVacaciones")) {
          anotar("saldo", transaction, p, query);
          const s = pendientes.get(transaction)?.get(id) ?? saldosActuales.get(id);
          return { recordset: s ? [{ ...s }] : [] };
        }
        if (query.includes("FROM dbo.AsistenciasDiarias")) {
          anotar("asistencias", transaction, p, query);
          return { recordset: (opciones.asistencias ?? []).filter((a) =>
            a.ColaboradorId === id && a.FechaAsignada >= p.desde && a.FechaAsignada <= p.hasta) };
        }
        if (query.includes("FROM dbo.Incapacidades")) {
          anotar("incapacidades", transaction, p, query);
          return { recordset: (opciones.incapacidades ?? []).filter((i) =>
            i.ColaboradorId === id && i.Estado === p.estado && i.FechaFin >= p.desde && i.FechaInicio <= p.hasta) };
        }
        if (query.includes("FROM dbo.PermisosLaborales")) {
          anotar("permisos", transaction, p, query);
          provocar("falloPermisos", id);
          return { recordset: (opciones.permisos ?? []).filter((permiso) =>
            permiso.ColaboradorId === id && permiso.Estado === p.estado &&
            permiso.FechaSolicitada >= p.desde && permiso.FechaSolicitada <= p.hasta) };
        }
        if (query.includes("UPDATE dbo.SaldosVacaciones")) {
          const evento = anotar("actualizar", transaction, p, query);
          evento.tipos = tipos;
          provocar("falloActualizar", id);
          if (controles.sinActualizacion) return { recordset: [] };
          const actual = pendientes.get(transaction)?.get(id) ?? saldosActuales.get(id);
          const nuevo = { ...actual, DiasAcumulados: p.diasacumulados,
            DiasDisponibles: Number((p.diasacumulados - actual.DiasUtilizados).toFixed(2)),
            FechaAcumuladaHasta: p.fechaacumuladahasta };
          if (!pendientes.has(transaction)) pendientes.set(transaction, new Map());
          pendientes.get(transaction).set(id, nuevo);
          return { recordset: [nuevo] };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          anotar("bitacora", transaction, p, query);
          provocar("falloBitacora", p.registroid);
          if (controles.sinBitacora) return { rowsAffected: [0] };
          auditorias.push({ ...p, transaction, datosNuevos: JSON.parse(p.datosnuevos), datosAnteriores: JSON.parse(p.datosanteriores) });
          return { rowsAffected: [1] };
        }
        throw new Error(`Consulta no simulada: ${query}`);
      },
    };
  }
  t.mock.method(pool, "request", () => request());
  t.mock.method(sql.Transaction.prototype, "request", function () { return request(this); });
  return { eventos, operaciones, auditorias, controles, errorOriginal, saldosActuales,
    transaction: new sql.Transaction(pool) };
}

test("acumulación exige una transacción antes de consultar", async (t) => {
  const bd = prepararBD(t);
  await assert.rejects(saldos.acumularVacacionesColaborador(1, "2026-10-05", 7), { status: 500, message: "Se requiere una transacción para acumular vacaciones." });
  assert.equal(bd.eventos.length, 0);
});

for (const [nombre, id, corte, actor] of [
  ["colaborador cero", 0, "2026-10-05", 7],
  ["colaborador decimal", 1.5, "2026-10-05", 7],
  ["actor inválido", 1, "2026-10-05", "x"],
  ["actor ausente", 1, "2026-10-05", undefined],
  ["corte sin formato", 1, "12/10/2026", 7],
  ["corte imposible", 1, "2026-02-30", 7],
]) {
  test(`rechaza ${nombre} sin consultar`, async (t) => {
    const bd = prepararBD(t);
    await assert.rejects(saldos.acumularVacacionesColaborador(id, corte, actor, bd.transaction), { status: 400 });
    assert.equal(bd.eventos.length, 0);
  });
}

test("IDs de texto se normalizan y el bloqueo precede al saldo; sin saldo devuelve 404", async (t) => {
  const bd = prepararBD(t, { saldos: [] });
  await assert.rejects(saldos.acumularVacacionesColaborador(" 1 ", "2026-10-05", "7", bd.transaction),
    { status: 404, message: "El colaborador no tiene un saldo de vacaciones inicializado." });
  assert.deepEqual(bd.eventos.map((e) => e.tipo), ["bloquear", "saldo"]);
  assert.equal(bd.eventos[0].parametros.colaboradorid, 1);
  assert.ok(bd.eventos.every((e) => e.transaction === bd.transaction));
});

test("consulta la semana completa, aporta solo fechas pendientes y conserva la misma transacción", async (t) => {
  const bd = prepararBD(t, { asistencias: [asistencia("2026-10-01", 480), asistencia("2026-10-02", 240), asistencia("2026-10-05", 480), asistencia("2026-10-06", 480)] });
  const resultado = await saldos.acumularVacacionesColaborador("1", "2026-10-05", "7", bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.22);
  assert.equal(resultado.FechaAcumuladaHasta.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.deepEqual(bd.eventos.map((e) => e.tipo), ["bloquear", "saldo", "asistencias", "incapacidades", "permisos", "actualizar", "bitacora"]);
  assert.ok(bd.eventos.every((e) => e.transaction === bd.transaction));
  const consulta = bd.operaciones("asistencias")[0];
  assert.equal(consulta.parametros.desde.toISOString().slice(0, 10), "2026-09-28");
  assert.equal(consulta.parametros.hasta.toISOString().slice(0, 10), "2026-10-05");
  assert.match(consulta.query, /COALESCE\(\s*a.MinutosAjustados,\s*a.MinutosCalculados\s*\) AS MinutosEfectivos/);
  assert.match(consulta.query, /a.FechaAsignada >= @desde/);
  assert.match(consulta.query, /a.FechaAsignada <= @hasta/);
  const auditoria = bd.auditorias[0];
  assert.equal(auditoria.usuarioid, 7);
  assert.equal(auditoria.entidad, "SaldosVacaciones");
  assert.equal(auditoria.accion, "ACTUALIZAR");
  assert.equal(auditoria.datosAnteriores.DiasAcumulados, 1.1);
  assert.equal(auditoria.datosNuevos.diasLaboradosProcesados, 2);
  assert.equal(auditoria.datosNuevos.diasGanadosPorDescanso, 0.04);
  assert.equal(auditoria.datosNuevos.diasGanados, 0.12);
});

for (const ultimoDia of ["2026-10-05", "2026-10-06"]) {
  test(`saldo procesado hasta ${ultimoDia}: omite escritura y bitácora`, async (t) => {
    const actual = { ...saldoBase(), FechaAcumuladaHasta: fecha(ultimoDia) };
    const bd = prepararBD(t, { saldos: [actual] });
    assert.deepEqual(await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction), actual);
    assert.deepEqual(bd.eventos.map((e) => e.tipo), ["bloquear", "saldo"]);
  });
}

test("cuatro y ocho horas aportan 0.04 cada una; duplicados y cero minutos no añaden días", async (t) => {
  const bd = prepararBD(t, { asistencias: [asistencia("2026-10-02", 240), asistencia("2026-10-03", 480), asistencia("2026-10-03", 480), asistencia("2026-10-04", 0), asistencia("2026-10-05", null)] });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.22);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 2);
});

test("aprobadas excluyen ambos extremos; ajenas al rango, pendientes y en revisión no excluyen", async (t) => {
  const bd = prepararBD(t, {
    asistencias: ["02", "03", "04", "05", "06"].map((dia) => asistencia(`2026-10-${dia}`, 480)),
    incapacidades: [incapacidad("2026-10-02", "2026-10-03"), incapacidad("2026-09-01", "2026-09-05"),
      incapacidad("2026-10-07", "2026-10-09"), incapacidad("2026-10-04", "2026-10-04", "PENDIENTE"),
      incapacidad("2026-10-05", "2026-10-05", "EN_REVISION_RH"), incapacidad("2026-10-06", "2026-10-06", "RECHAZADA")],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-06", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.26);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 3);
  const consulta = bd.operaciones("incapacidades")[0];
  assert.equal(consulta.parametros.estado, "APROBADA");
  assert.match(consulta.query, /s.Estado = @estado/);
  assert.match(consulta.query, /i.FechaFin >= @desde/);
  assert.match(consulta.query, /i.FechaInicio <= @hasta/);
});

test("una aprobada que atraviesa todo el rango excluye todos sus días", async (t) => {
  const bd = prepararBD(t, { asistencias: [asistencia("2026-10-02", 480), asistencia("2026-10-05", 240)], incapacidades: [incapacidad("2026-09-30", "2026-10-08")] });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.1);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 0);
});

test("se redondea a dos decimales y el repositorio guarda DECIMAL(8,2) sin cambiar los utilizados", async (t) => {
  const bd = prepararBD(t, { saldos: [{ ...saldoBase(), DiasAcumulados: 0.10, DiasUtilizados: 0 }], asistencias: [asistencia("2026-10-02", 1), asistencia("2026-10-03", 240), asistencia("2026-10-04", 480)] });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 0.26);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanados, 0.16);
  const escritura = bd.operaciones("actualizar")[0];
  assert.equal(escritura.tipos.diasacumulados.type, sql.Decimal);
  assert.equal(escritura.tipos.diasacumulados.precision, 8);
  assert.equal(escritura.tipos.diasacumulados.scale, 2);
  assert.doesNotMatch(escritura.query, /SET\s+DiasUtilizados\s*=/);
});

for (const asistencias of [[], [asistencia("2026-10-02", 0)]]) {
  test(`sin días válidos (${asistencias.length} asistencias) avanza fecha y audita sin incrementar saldo`, async (t) => {
    const bd = prepararBD(t, { asistencias });
    const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction);
    assert.equal(resultado.DiasAcumulados, 1.1);
    assert.equal(resultado.FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-05");
    assert.equal(bd.auditorias[0].datosNuevos.diasGanados, 0);
    assert.equal(bd.operaciones("commit").length + bd.operaciones("rollback").length, 0);
  });
}

test("repetir el corte después de guardar no duplica acumulados ni bitácoras", async (t) => {
  const bd = prepararBD(t, { asistencias: [asistencia("2026-10-02", 480)] });
  await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction);
  await bd.transaction.commit();
  const segunda = new sql.Transaction(pool);
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, segunda);
  assert.equal(resultado.DiasAcumulados, 1.18);
  assert.equal(bd.operaciones("actualizar").length, 1);
  assert.equal(bd.auditorias.length, 1);
});

for (const fallo of ["falloActualizar", "falloBitacora", "sinActualizacion", "sinBitacora"]) {
  test(`la acumulación individual propaga ${fallo} sin commit ni rollback`, async (t) => {
    const bd = prepararBD(t);
    bd.controles[fallo] = true;
    await assert.rejects(saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction),
      fallo.startsWith("fallo") ? (error) => error === bd.errorOriginal : { status: fallo === "sinActualizacion" ? 409 : 500 });
    assert.equal(bd.operaciones("commit").length + bd.operaciones("rollback").length, 0);
  });
}

test("saldo no numérico no se sobrescribe", async (t) => {
  const bd = prepararBD(t, { saldos: [{ ...saldoBase(), DiasAcumulados: "inválido" }] });
  await assert.rejects(saldos.acumularVacacionesColaborador(1, "2026-10-05", 7, bd.transaction), { status: 500 });
  assert.equal(bd.operaciones("actualizar").length, 0);
});

for (const [dias, esperado] of [[0, 0], [1, 0.08], [3, 0.16], [6, 0.28]]) {
  test(`semana completa con ${dias} días válidos: aporte total ${esperado}`, async (t) => {
    const bd = prepararBD(t, {
      saldos: [{ ...saldoBase(), DiasAcumulados: 0, DiasUtilizados: 0, FechaAcumuladaHasta: fecha("2026-10-11") }],
      asistencias: Array.from({ length: dias }, (_, i) => asistencia(`2026-10-${12 + i}`, 480)),
    });
    const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
    assert.equal(resultado.DiasAcumulados, esperado);
    assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, dias > 0 ? 0.04 : 0);
    assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, dias);
    assert.equal(bd.operaciones("asistencias").length, 1);
    assert.equal(bd.operaciones("incapacidades").length, 1);
  });
}

test("domingo pendiente reconoce trabajo del martes ya procesado sin repetir su aporte diario", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-17") }],
    asistencias: [asistencia("2026-10-13", 480), asistencia("2026-10-13", 480)],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.14);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 0);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0.04);
  assert.equal(bd.operaciones("asistencias")[0].parametros.desde.toISOString().slice(0, 10), "2026-10-12");
  await bd.transaction.commit();
  await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, new sql.Transaction(pool));
  assert.equal(bd.auditorias.length, 1);
});

for (const [nombre, diasIncapacidad, minutos, esperado] of [
  ["incapacidad aprobada", "APROBADA", 480, 0],
  ["incapacidad pendiente", "PENDIENTE", 480, 0.04],
  ["incapacidad en revisión", "EN_REVISION_RH", 480, 0.04],
  ["asistencia con cero minutos", null, 0, 0],
]) {
  test(`el complemento reutiliza el filtro de días válidos: ${nombre}`, async (t) => {
    const bd = prepararBD(t, {
      saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-17") }],
      asistencias: [asistencia("2026-10-13", minutos)],
      incapacidades: diasIncapacidad ? [incapacidad("2026-10-12", "2026-10-18", diasIncapacidad)] : [],
    });
    const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
    assert.equal(resultado.DiasAcumulados, Number((1.1 + esperado).toFixed(2)));
    assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, esperado);
    assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 0);
    assert.equal(bd.operaciones("incapacidades").length, 1);
  });
}

test("antes del domingo no reconoce una semana incompleta", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-12", 480)],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-17", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.14);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0);
});

test("recuperación el martes reconoce el domingo pendiente sin depender del día actual", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T11:00:00Z") });
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-17") }],
    asistencias: [asistencia("2026-10-13", 480)],
  });
  await saldos.actualizarAcumulacionVacaciones(7);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.14);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0.04);
});

test("recupera varias semanas y no incluye el trabajo posterior al corte", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-13", 480), asistencia("2026-10-20", 240), asistencia("2026-10-27", 480)],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-26", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.26);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 2);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0.08);
});

test("dos semanas completas de incapacidad aprobada no aportan días ni complementos", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-13", 480), asistencia("2026-10-20", 480)],
    incapacidades: [incapacidad("2026-10-12", "2026-10-25")],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-25", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.1);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanados, 0);
});

test("lunes antes de las cinco no reconoce el domingo; después lo reconoce una sola vez", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T10:59:59Z") });
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-16") }],
    asistencias: [asistencia("2026-10-13", 480)],
  });
  await saldos.actualizarAcumulacionVacaciones(7);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.1);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0);
  t.mock.timers.tick(1000);
  await saldos.actualizarAcumulacionVacaciones(7);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.14);
  await saldos.actualizarAcumulacionVacaciones(7);
  assert.equal(bd.auditorias.length, 2);
  assert.equal(bd.auditorias[1].datosNuevos.diasGanadosPorDescanso, 0.04);
});

test("un fallo de bitácora revierte el complemento y el reintento lo aplica una sola vez", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-17") }],
    asistencias: [asistencia("2026-10-13", 480)],
  });
  bd.controles.falloBitacora = true;
  assert.equal((await saldos.actualizarAcumulacionVacaciones(7)).fallidos, 1);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.1);
  assert.equal(bd.saldosActuales.get(1).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-17");
  bd.controles.falloBitacora = false;
  await saldos.actualizarAcumulacionVacaciones(7);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.14);
  assert.equal(bd.auditorias.length, 1);
});

for (const [procesado, corte, trabajado] of [
  ["2026-12-31", "2027-01-03", "2026-12-28"],
  ["2024-02-29", "2024-03-03", "2024-02-27"],
]) {
  test(`semana que atraviesa mes/año: ${procesado} → ${corte}`, async (t) => {
    const bd = prepararBD(t, {
      saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha(procesado) }],
      asistencias: [asistencia(trabajado, 480)],
    });
    const resultado = await saldos.acumularVacacionesColaborador(1, corte, 7, bd.transaction);
    assert.equal(resultado.DiasAcumulados, 1.14);
    assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0.04);
    assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 0);
  });
}

for (const [estado, esperado] of [["APROBADA", 0], ["PENDIENTE", 0.08], ["RECHAZADA", 0.08]]) {
  test(`permiso ${estado}: aporte diario y semanal total ${esperado}`, async (t) => {
    const bd = prepararBD(t, {
      saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
      asistencias: [asistencia("2026-10-13", 480)],
      permisos: [permiso("2026-10-13", estado)],
    });
    const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
    assert.equal(resultado.DiasAcumulados, Number((1.1 + esperado).toFixed(2)));
    assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, estado === "APROBADA" ? 0 : 1);
    assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, estado === "APROBADA" ? 0 : 0.04);
    const consulta = bd.operaciones("permisos")[0];
    assert.equal(consulta.parametros.estado, "APROBADA");
    assert.equal(consulta.parametros.colaboradorid, 1);
    assert.equal(consulta.parametros.desde.toISOString().slice(0, 10), "2026-10-12");
    assert.equal(consulta.parametros.hasta.toISOString().slice(0, 10), "2026-10-18");
    assert.match(consulta.query, /s.Estado = @estado/);
    assert.match(consulta.query, /d.FechaSolicitada >= @desde/);
    assert.match(consulta.query, /d.FechaSolicitada <= @hasta/);
    assert.ok(bd.eventos.every((evento) => evento.transaction === bd.transaction));
  });
}

test("permiso aprobado excluye solo su fecha; otro día válido conserva el complemento", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-12", 240), asistencia("2026-10-13", 480)],
    permisos: [permiso("2026-10-13")],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.18);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 1);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0.04);
});

test("consulta permisos de toda la semana aunque solo esté pendiente el domingo", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-17") }],
    asistencias: [asistencia("2026-10-13", 480)],
    permisos: [permiso("2026-10-13")],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.1);
  assert.equal(resultado.FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-18");
  assert.equal(bd.auditorias[0].datosNuevos.diasGanadosPorDescanso, 0);
  assert.equal(bd.operaciones("permisos").length, 1);
});

test("semana con permisos aprobados todos los días no genera aportes ni complemento", async (t) => {
  const dias = [12, 13, 14, 15, 16, 17, 18];
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: dias.map((dia) => asistencia(`2026-10-${dia}`, 480)),
    permisos: dias.map((dia) => permiso(`2026-10-${dia}`)),
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.1);
  assert.equal(bd.auditorias[0].datosNuevos.diasGanados, 0);
});

test("permisos fuera del rango o de otro colaborador no excluyen fechas propias", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-13", 480)],
    permisos: [permiso("2026-10-11"), permiso("2026-10-19"), permiso("2026-10-13", "APROBADA", 2)],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.18);
});

test("permiso e incapacidad en una misma fecha la excluyen una sola vez", async (t) => {
  const bd = prepararBD(t, {
    saldos: [{ ...saldoBase(), FechaAcumuladaHasta: fecha("2026-10-11") }],
    asistencias: [asistencia("2026-10-12", 480), asistencia("2026-10-13", 480), asistencia("2026-10-14", 480)],
    permisos: [permiso("2026-10-13"), permiso("2026-10-14")],
    incapacidades: [incapacidad("2026-10-14", "2026-10-14")],
  });
  const resultado = await saldos.acumularVacacionesColaborador(1, "2026-10-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, 1.18);
  assert.equal(bd.auditorias[0].datosNuevos.diasLaboradosProcesados, 1);
});

const casosCalendario = [
  ["2026-10-12T10:59:59Z", "2026-10-10"],
  ["2026-10-12T11:00:00Z", "2026-10-11"],
  ["2026-10-12T06:00:00Z", "2026-10-10"],
  ["2026-11-01T10:59:59Z", "2026-10-30"],
  ["2026-11-01T11:00:00Z", "2026-10-31"],
  ["2027-01-01T10:59:59Z", "2026-12-30"],
  ["2027-01-01T11:00:00Z", "2026-12-31"],
  ["2024-03-01T10:59:59Z", "2024-02-28"],
  ["2024-03-01T11:00:00Z", "2024-02-29"],
  ["2026-03-01T11:00:00Z", "2026-02-28"],
];
for (const [instante, corte] of casosCalendario) {
  test(`corte CR ${instante} → ${corte}, resumen vacío sin transacciones`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(instante) });
    const bd = prepararBD(t, { colaboradores: [] });
    assert.equal(fechas.obtenerFechaCorteVacaciones(), corte);
    assert.deepEqual(await saldos.actualizarAcumulacionVacaciones(7), { fechaCorte: corte, procesados: 0, fallidos: 0 });
    assert.equal(bd.operaciones("lista").length, 1);
    assert.equal(bd.operaciones("begin").length, 0);
  });
}

test("el corte no depende de TZ del equipo", () => {
  const modulo = new URL("../src/shared/utils/fechaUtils.js", import.meta.url).href;
  for (const TZ of ["UTC", "America/Costa_Rica", "America/New_York", "Asia/Tokyo"]) {
    const resultado = spawnSync(process.execPath, ["--input-type=module", "-e", `import { obtenerFechaCorteVacaciones } from ${JSON.stringify(modulo)}; console.log(obtenerFechaCorteVacaciones(new Date('2024-03-01T11:00:00Z')));`], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(resultado.stdout.trim(), "2024-02-29");
  }
});

test("el coordinador espera la lista y congela el corte antes de las consultas", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T10:59:59Z") });
  const bd = prepararBD(t, { colaboradores: [{ ColaboradorId: 1 }, { ColaboradorId: 2 }], saldos: [saldoBase(1), saldoBase(2)] });
  let liberar;
  bd.controles.esperarLista = new Promise((resolve) => { liberar = resolve; });
  const ejecucion = saldos.actualizarAcumulacionVacaciones(7);
  await siguienteTurno();
  assert.equal(bd.operaciones("begin").length, 0);
  t.mock.timers.tick(1000);
  liberar();
  assert.deepEqual(await ejecucion, { fechaCorte: "2026-10-10", procesados: 2, fallidos: 0 });
  assert.equal(new Set(bd.operaciones("begin").map((e) => e.transaction)).size, 2);
  assert.ok(bd.operaciones("actualizar").every((e) => e.parametros.fechaacumuladahasta.toISOString().slice(0, 10) === "2026-10-10"));
});

test("el corte recibido se valida y no se recalcula al cruzar las cinco", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T11:00:00Z") });
  const bd = prepararBD(t);
  await assert.rejects(saldos.actualizarAcumulacionVacaciones(7, "inválido"), { status: 400 });
  assert.equal(bd.operaciones("lista").length, 0);
  assert.equal((await saldos.actualizarAcumulacionVacaciones(7, "2026-10-10")).fechaCorte, "2026-10-10");
});

for (const fallo of ["falloActualizar", "falloBitacora", "falloPermisos", "falloCommit", "falloBegin", "saldoAusente"]) {
  test(`coordinador continúa con los demás ante ${fallo}; solo cuenta commits exitosos`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T11:00:00Z") });
    const bd = prepararBD(t, { colaboradores: [{ ColaboradorId: 1 }, { ColaboradorId: 2 }, { ColaboradorId: 3 }],
      saldos: fallo === "saldoAusente" ? [saldoBase(2), saldoBase(3)] : [saldoBase(1), saldoBase(2), saldoBase(3)] });
    if (fallo === "falloBegin") bd.controles.falloBegin = 1;
    else if (fallo !== "saldoAusente") bd.controles[fallo] = new Set([1]);
    assert.deepEqual(await saldos.actualizarAcumulacionVacaciones(7), { fechaCorte: "2026-10-11", procesados: 2, fallidos: 1 });
    assert.equal(bd.operaciones("commit").length, 2);
    assert.equal(bd.operaciones("rollback").length, fallo === "falloBegin" ? 0 : 1);
    if (fallo !== "saldoAusente") assert.equal(bd.saldosActuales.get(1).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-01");
    assert.equal(bd.saldosActuales.get(3).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-11");
  });
}

test("fallo de rollback no oculta el error original en los registros", async (t) => {
  const bd = prepararBD(t);
  bd.controles.falloBitacora = true;
  bd.controles.falloRollback = true;
  const errores = t.mock.method(console, "error", () => {});
  assert.equal((await saldos.actualizarAcumulacionVacaciones(7)).fallidos, 1);
  assert.equal(errores.mock.callCount(), 2);
  assert.match(errores.mock.calls[0].arguments[1].message, /rollback/);
  assert.equal(errores.mock.calls[1].arguments[1], bd.errorOriginal);
});

test("todos fallidos devuelve cero procesados; comenzar una nueva ejecución reinicia contadores", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T11:00:00Z") });
  const bd = prepararBD(t, { colaboradores: [{ ColaboradorId: 1 }, { ColaboradorId: 2 }], saldos: [saldoBase(1), saldoBase(2)] });
  bd.controles.falloActualizar = true;
  assert.deepEqual(await saldos.actualizarAcumulacionVacaciones(7), { fechaCorte: "2026-10-11", procesados: 0, fallidos: 2 });
  bd.controles.falloActualizar = false;
  assert.deepEqual(await saldos.actualizarAcumulacionVacaciones(7), { fechaCorte: "2026-10-11", procesados: 2, fallidos: 0 });
});

test("un fallo de lista se propaga sin transacciones y un actor inválido ni consulta", async (t) => {
  const bd = prepararBD(t);
  await assert.rejects(saldos.actualizarAcumulacionVacaciones(0), { status: 400 });
  assert.equal(bd.eventos.length, 0);
  bd.controles.falloLista = true;
  await assert.rejects(saldos.actualizarAcumulacionVacaciones(7), (error) => error === bd.errorOriginal);
  assert.equal(bd.operaciones("begin").length, 0);
});

test("repositorio selecciona solo activos con saldo inicializado y ordena por ID", async (t) => {
  const bd = prepararBD(t);
  await repositorio.getColaboradoresParaAcumulacion();
  const query = bd.operaciones("lista")[0].query;
  assert.match(query, /INNER JOIN dbo.SaldosVacaciones/);
  assert.match(query, /WHERE c.Activo = 1/);
  assert.match(query, /ORDER BY c.ColaboradorId/);
});

test("repositorio exige transacción y conserva restricción de días utilizados", async (t) => {
  const bd = prepararBD(t);
  await assert.rejects(repositorio.updateDiasAcumulados(1, 1.14, fecha("2026-10-05")), { status: 500 });
  assert.equal(bd.eventos.length, 0);
  await repositorio.updateDiasAcumulados(1, 1.14, fecha("2026-10-05"), bd.transaction);
  assert.match(bd.operaciones("actualizar")[0].query, /@diasAcumulados >= DiasUtilizados/);
});

let numeroTarea = 0;
async function prepararTarea(t, bd) {
  const tarea = await import(`../src/modules/vacaciones/vacaciones.tarea.js?prueba=${++numeroTarea}`);
  const original = globalThis.setInterval;
  const intervalo = t.mock.method(globalThis, "setInterval", (fn, ms) => original(fn, ms));
  t.after(async () => { await tarea.detenerTareaVacaciones(); });
  return { ...tarea, intervalo, bd };
}

test("tarea ESM comparte recuperación inicial y crea un único temporizador de un minuto", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T10:59:59Z") });
  const bd = prepararBD(t);
  let liberar;
  bd.controles.esperarLista = new Promise((resolve) => { liberar = resolve; });
  const tarea = await prepararTarea(t, bd);
  const inicio = tarea.iniciarTareaVacaciones(7);
  assert.equal(tarea.iniciarTareaVacaciones(7), inicio);
  await siguienteTurno();
  assert.equal(tarea.intervalo.mock.callCount(), 0);
  liberar();
  const temporizador = await inicio;
  assert.equal(await tarea.iniciarTareaVacaciones(7), temporizador);
  assert.equal(tarea.intervalo.mock.callCount(), 1);
  assert.equal(tarea.intervalo.mock.calls[0].arguments[1], 60_000);
  assert.equal(bd.operaciones("actualizar")[0].parametros.fechaacumuladahasta.toISOString().slice(0, 10), "2026-10-10");
});

test("ticks omiten todo acceso a saldos hasta cambiar el corte a las cinco; no se solapan", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T10:58:00Z") });
  const bd = prepararBD(t);
  const tarea = await prepararTarea(t, bd);
  await tarea.iniciarTareaVacaciones(7);
  const consultas = bd.eventos.length;
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.eventos.length, consultas);
  let liberar;
  bd.controles.esperarCommit = new Promise((resolve) => { liberar = resolve; });
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 2);
  t.mock.timers.tick(120_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 2);
  liberar();
  await siguienteTurno();
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 2);
  assert.equal(bd.saldosActuales.get(1).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-11");
});

test("recuperación que cruza las cinco conserva su corte y procesa el siguiente en el próximo tick", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T10:59:59Z") });
  const bd = prepararBD(t);
  const tarea = await prepararTarea(t, bd);
  let liberar;
  bd.controles.esperarLista = new Promise((resolve) => { liberar = resolve; });
  const inicio = tarea.iniciarTareaVacaciones(7);
  await siguienteTurno();
  t.mock.timers.tick(1000);
  liberar();
  await inicio;
  assert.equal(bd.saldosActuales.get(1).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-10");
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.saldosActuales.get(1).FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-11");
});

test("fallidos individuales reintentan el mismo corte; éxitos anteriores no duplican aportes", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T11:00:00Z") });
  const bd = prepararBD(t, { colaboradores: [{ ColaboradorId: 1 }, { ColaboradorId: 2 }], saldos: [saldoBase(1), saldoBase(2)],
    asistencias: [asistencia("2026-10-02", 480, 1), asistencia("2026-10-02", 480, 2)] });
  bd.controles.falloActualizar = new Set([1]);
  const tarea = await prepararTarea(t, bd);
  await tarea.iniciarTareaVacaciones(7);
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 2);
  bd.controles.falloActualizar = false;
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 3);
  assert.equal(bd.auditorias.length, 2);
  assert.equal(bd.saldosActuales.get(1).DiasAcumulados, 1.18);
  assert.equal(bd.saldosActuales.get(2).DiasAcumulados, 1.18);
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 3);
});

test("fallo inicial propaga el error, no instala intervalo y permite reiniciar", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T11:00:00Z") });
  const bd = prepararBD(t);
  bd.controles.falloLista = true;
  const tarea = await prepararTarea(t, bd);
  await assert.rejects(tarea.iniciarTareaVacaciones(7), (error) => error === bd.errorOriginal);
  assert.equal(tarea.intervalo.mock.callCount(), 0);
  bd.controles.falloLista = false;
  await tarea.iniciarTareaVacaciones(7);
  assert.equal(tarea.intervalo.mock.callCount(), 1);
});

test("error periódico menciona vacaciones, libera ejecución y no marca el corte completado", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T10:59:00Z") });
  const bd = prepararBD(t);
  const errores = t.mock.method(console, "error", () => {});
  const tarea = await prepararTarea(t, bd);
  await tarea.iniciarTareaVacaciones(7);
  bd.controles.falloLista = true;
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(errores.mock.callCount(), 1);
  assert.match(errores.mock.calls[0].arguments[0], /vacaciones/);
  assert.equal(errores.mock.calls[0].arguments[1], bd.errorOriginal);
  bd.controles.falloLista = false;
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 3);
  t.mock.timers.tick(60_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 3);
});

test("lista vacía completa el corte; detener elimina el intervalo y permite nueva recuperación", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-10-12T11:00:00Z") });
  const bd = prepararBD(t, { colaboradores: [] });
  const tarea = await prepararTarea(t, bd);
  await tarea.iniciarTareaVacaciones(7);
  t.mock.timers.tick(120_000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 1);
  await tarea.detenerTareaVacaciones();
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  await siguienteTurno();
  assert.equal(bd.operaciones("lista").length, 1);
  await tarea.iniciarTareaVacaciones(7);
  assert.equal(bd.operaciones("lista").length, 2);
});

for (const falla of [null, "conexion", "periodos", "vacaciones", "escuchar"]) {
  test(`arranque del servidor con dependencias simuladas: ${falla ?? "recuperación antes de HTTP"}`, async () => {
    const codigo = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
    assert.match(codigo, /from "\.\/modules\/vacaciones\/vacaciones.tarea.js"/);
    const eventos = [];
    const errores = [];
    const timerPeriodos = {};
    const proceso = { env: { PORT: "4000", USUARIO_SISTEMA_ID: "7" } };
    function paso(nombre) {
      eventos.push(nombre);
      if (falla === nombre) throw new Error(`Fallo de ${nombre}`);
    }
    // Ejecuta el código real de arranque en un contexto separado, sin importar
    // app.js ni abrir sockets/SQL. Solo reemplaza sus dependencias externas.
    await runInNewContext(codigo.replace(/^import[\s\S]*?;\r?\n/gm, ""), {
      process: proceso,
      console: { log() {}, error: (...args) => errores.push(args) },
      app: {},
      getConnection: async () => paso("conexion"),
      closeConnection: async () => eventos.push("cerrar"),
      iniciarTareaPeriodos: async (actor) => { assert.equal(actor, "7"); paso("periodos"); return timerPeriodos; },
      iniciarTareaVacaciones: async (actor) => { assert.equal(actor, "7"); paso("vacaciones"); },
      detenerTareaVacaciones: async () => eventos.push("detener-vacaciones"),
      clearInterval: (timer) => { if (timer) { assert.equal(timer, timerPeriodos); eventos.push("detener-periodos"); } },
      createServer: () => ({ listen: (puerto) => { assert.equal(puerto, 4000); eventos.push("listen"); } }),
      once: async (_server, evento) => { assert.equal(evento, "listening"); paso("escuchar"); },
    });
    if (falla === null) {
      assert.deepEqual(eventos, ["conexion", "periodos", "vacaciones", "listen", "escuchar"]);
      assert.equal(proceso.exitCode, undefined);
    } else {
      assert.equal(proceso.exitCode, 1);
      assert.equal(eventos.at(-1), "cerrar");
      assert.ok(errores.some((args) => args.includes(`Fallo de ${falla}`)));
      assert.equal(eventos.includes("detener-periodos"), ["vacaciones", "escuchar"].includes(falla));
      if (falla !== "escuchar") assert.equal(eventos.includes("listen"), false);
      assert.ok(eventos.indexOf("detener-vacaciones") < eventos.indexOf("cerrar"));
    }
  });
}
