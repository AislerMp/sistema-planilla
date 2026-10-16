import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { acciones, entidades, listarBitacoras } = await import("../src/modules/bitacora/bitacora.service.js");
const { accionesBitacora, entidadesBitacora } = await import("../../client/src/constants/bitacora.js");

// Se simula el cálculo para aislar las pruebas de resolución. Los repositorios y la bitácora
// se ejecutan realmente contra requests SQL simulados, sin conectar a la BD.
const calculos = { registrar: async () => undefined };
const urlCalculo = new URL("../src/modules/vacaciones/services/calculosVacaciones.service.js", import.meta.url).href;
globalThis.__calculoVacacionesPrueba = (...args) => calculos.registrar(...args);
const hook = registerHooks({
  load(url, context, nextLoad) {
    if (url === urlCalculo) return { format: "module", shortCircuit: true,
      source: "export const registrarCalculoVacaciones = globalThis.__calculoVacacionesPrueba;" };
    return nextLoad(url, context);
  },
});
let vacaciones;
try {
  vacaciones = await import("../src/modules/vacaciones/services/vacaciones.service.js");
} finally {
  hook.deregister();
  delete globalThis.__calculoVacacionesPrueba;
}

const usuarioRh = { UsuarioId: 7, Rol: "RECURSOS_HUMANOS" };
const solicitudBase = {
  SolicitudId: 31, TipoSolicitud: "VACACIONES", ColaboradorId: 2018,
  RestauranteId: 2, RegistradoPorUsuarioId: 2, Estado: "EN_REVISION_RH",
  RevisadoPorGerenteId: 4, RevisadoPorRhId: null, Observacion: "Revisión del gerente",
  FechaInicio: new Date("2026-11-02"), FechaFin: new Date("2026-11-04"), DiasSolicitados: 3,
};
const json = (value) => JSON.parse(JSON.stringify(value));

function prepararBD(t, opciones = {}) {
  const solicitud = opciones.solicitud === null ? null : { ...solicitudBase, ...opciones.solicitud };
  const eventos = [];
  const auditorias = [];
  const fallos = new Error("Fallo simulado");
  t.mock.method(console, "error", () => {});
  t.mock.method(pool, "connect", async () => pool);
  for (const operacion of ["begin", "commit", "rollback"]) {
    t.mock.method(sql.Transaction.prototype, operacion, async function () {
      eventos.push({ tipo: operacion, transaction: this });
      if (opciones.fallo === operacion) throw fallos;
    });
  }
  const request = (transaction = null) => {
    const parametros = {};
    return {
      input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
      async query(query) {
        eventos.push({ tipo: "query", query, parametros, transaction });
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) return { recordset: [{ ColaboradorId: 2018 }] };
        if (query.includes("FROM Usuarios")) return { recordset: [{ RestauranteId: 2 }] };
        if (query.includes("SELECT * FROM Colaboradores")) return { recordset: [{ ColaboradorId: 2018, RestauranteId: 2, Activo: true }] };
        if (query.includes("FROM dbo.Vacaciones")) return { recordset: opciones.anteriores ?? [] };
        if (query.includes("FROM dbo.Solicitudes AS s")) return { recordset: solicitud ? [{ ...solicitud }] : [] };
        if (query.includes("FROM dbo.SaldosVacaciones")) return { recordset: opciones.sinSaldo ? [] : [{ DiasDisponibles: opciones.disponibles ?? 10 }] };
        if (query.includes("INSERT INTO dbo.Solicitudes")) return { recordset: [{ SolicitudId: 31 }] };
        if (query.includes("INSERT INTO dbo.Vacaciones")) return { recordset: [], rowsAffected: [1] };
        if (query.includes("UPDATE dbo.Solicitudes")) {
          assert.equal(parametros.tipoSolicitud, "VACACIONES");
          if (opciones.conflicto) return { recordset: [] };
          return { recordset: [{ SolicitudId: 31, TipoSolicitud: "VACACIONES", Estado: parametros.estado,
            Observacion: parametros.observacion, RevisadoPorGerenteId: parametros.revisadoPorGerenteId ?? 4,
            RevisadoPorRhId: parametros.revisadoPorRhId ?? null }] };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          if (opciones.fallo === "bitacora") throw fallos;
          auditorias.push({ parametros, transaction });
          return { rowsAffected: [opciones.sinBitacora ? 0 : 1] };
        }
        throw new Error(`Consulta no simulada: ${query}`);
      },
    };
  };
  t.mock.method(pool, "request", () => request());
  t.mock.method(sql.Transaction.prototype, "request", function () { return request(this); });
  const calculo = [{ CalculoVacacionId: 9, SolicitudId: 31, DiasReconocidos: 3, MinutosReconocidos: 1440 }];
  const registrar = t.mock.method(calculos, "registrar", async (vacacion, transaction, actor) => {
    assert.equal(vacacion.Estado, "APROBADA");
    assert.equal(vacacion.DiasSolicitados, 3);
    assert.equal(actor, 7);
    assert.equal(transaction, eventos.find((e) => e.tipo === "begin").transaction);
    if (opciones.fallo === "calculo") throw fallos;
    return opciones.calculoVacio ? [] : calculo;
  });
  return { solicitud, eventos, auditorias, registrar, fallos, calculo };
}

for (const estado of ["APROBADA", "RECHAZADA"]) {
  test(`RH ${estado}: registra vacaciones, estado anterior/nuevo y cálculo simulado en la misma transacción`, async (t) => {
    const bd = prepararBD(t);
    const resultado = await vacaciones.resolverVacacionesRH("31", {
      estado: ` ${estado.toLowerCase()} `, observacion: " Revisado por RH ", revisadoPorRhId: 999,
    }, usuarioRh);
    assert.equal(resultado.vacacionActualizada.Estado, estado);
    assert.equal(resultado.registroCalculoCreado, estado === "APROBADA" ? bd.calculo : null);
    assert.equal(bd.registrar.mock.callCount(), estado === "APROBADA" ? 1 : 0);
    assert.equal(bd.auditorias.length, 1);
    const { parametros: p, transaction } = bd.auditorias[0];
    assert.equal(p.Entidad, "Vacaciones");
    assert.equal(p.Accion, estado === "APROBADA" ? "APROBAR_VACACIONES" : "RECHAZAR_VACACIONES");
    assert.equal(p.UsuarioId, 7);
    assert.equal(p.RegistroId, 31);
    assert.deepEqual(JSON.parse(p.DatosAnteriores), json(bd.solicitud));
    assert.deepEqual(JSON.parse(p.DatosNuevos), json({ ...bd.solicitud, ...resultado.vacacionActualizada, registroCalculoCreado: resultado.registroCalculoCreado }));
    assert.equal(resultado.vacacionActualizada.Observacion, "Revisado por RH");
    assert.equal(transaction, bd.eventos.find((e) => e.tipo === "begin").transaction);
    assert.equal(transaction, bd.eventos.find((e) => e.query?.includes("UPDATE dbo.Solicitudes")).transaction);
    assert.equal(bd.eventos.at(-1).tipo, "commit");
    assert.equal(bd.eventos.some((e) => e.tipo === "rollback"), false);
    if (estado === "RECHAZADA") assert.equal(bd.eventos.some((e) => e.query?.includes("FROM dbo.SaldosVacaciones")), false);
  });
}

for (const caso of [
  { nombre: "sin solicitud", solicitud: null, status: 404 },
  { nombre: "ya resuelta", solicitud: { Estado: "APROBADA" }, status: 409 },
  { nombre: "sin saldo", sinSaldo: true, status: 409 },
  { nombre: "saldo insuficiente", disponibles: 2, status: 409 },
  { nombre: "actualización concurrente", conflicto: true, status: 409 },
  { nombre: "resultado de cálculo vacío", calculoVacio: true, status: 500 },
  { nombre: "solicitud anterior pendiente", anteriores: [{ SolicitudId: 30, Estado: "PENDIENTE", FechaInicio: new Date("2026-10-20") }], status: 409 },
]) {
  test(`RH revierte ${caso.nombre} sin registrar éxito`, async (t) => {
    const bd = prepararBD(t, caso);
    await assert.rejects(vacaciones.resolverVacacionesRH(31, { estado: "APROBADA" }, usuarioRh), { status: caso.status });
    assert.equal(bd.auditorias.length, 0);
    assert.equal(bd.eventos.at(-1).tipo, "rollback");
    assert.equal(bd.eventos.some((e) => e.tipo === "commit"), false);
  });
}

for (const fallo of ["calculo", "bitacora", "commit"]) {
  test(`RH propaga fallo de ${fallo} y revierte la resolución`, async (t) => {
    const bd = prepararBD(t, { fallo });
    await assert.rejects(vacaciones.resolverVacacionesRH(31, { estado: "APROBADA" }, usuarioRh), (error) => error === bd.fallos);
    assert.equal(bd.eventos.at(-1).tipo, "rollback");
  });
}

test("RH revierte cuando la inserción de bitácora no afecta filas", async (t) => {
  const bd = prepararBD(t, { sinBitacora: true });
  await assert.rejects(vacaciones.resolverVacacionesRH(31, { estado: "RECHAZADA" }, usuarioRh), { status: 500 });
  assert.equal(bd.eventos.at(-1).tipo, "rollback");
  assert.equal(bd.eventos.some((e) => e.tipo === "commit"), false);
});

test("valida rol, estado e IDs antes de abrir la transacción", async (t) => {
  const bd = prepararBD(t);
  for (const Rol of ["ADMINISTRADOR", "GERENTE", "COLABORADOR"]) {
    await assert.rejects(vacaciones.resolverVacacionesRH(31, { estado: "APROBADA" }, { UsuarioId: 7, Rol }), { status: 403 });
  }
  await assert.rejects(vacaciones.resolverVacacionesRH(0, { estado: "APROBADA" }, usuarioRh), { status: 400 });
  await assert.rejects(vacaciones.resolverVacacionesRH(31, { estado: "PENDIENTE" }, usuarioRh), { status: 400 });
  assert.equal(bd.eventos.length, 0);
});

for (const estado of ["EN_REVISION_RH", "RECHAZADA"]) {
  test(`gerente ${estado}: entidad y acción de vacaciones con los datos completos`, async (t) => {
    const bd = prepararBD(t, { solicitud: { Estado: "PENDIENTE" } });
    const resultado = await vacaciones.revisarVacacionesGerente(31, { estado, observacion: " Revisado " }, { UsuarioId: 4, Rol: "GERENTE" });
    const { parametros: p, transaction } = bd.auditorias[0];
    assert.equal(p.Entidad, "Vacaciones");
    assert.equal(p.Accion, estado === "EN_REVISION_RH" ? "APROBAR_REVISION_VACACIONES" : "RECHAZAR_VACACIONES");
    assert.equal(p.UsuarioId, 4);
    assert.equal(p.RegistroId, 31);
    assert.deepEqual(JSON.parse(p.DatosAnteriores), json(bd.solicitud));
    assert.deepEqual(JSON.parse(p.DatosNuevos), json({ ...bd.solicitud, ...resultado }));
    assert.equal(transaction, bd.eventos.find((e) => e.tipo === "begin").transaction);
    assert.equal(bd.eventos.at(-1).tipo, "commit");
  });
}

test("crear vacaciones usa Vacaciones, CREAR y el ID generado", async (t) => {
  const bd = prepararBD(t, { solicitud: { Estado: "PENDIENTE" } });
  const resultado = await vacaciones.solicitarVacaciones({ fechaInicio: "2026-11-02", fechaFin: "2026-11-04", motivo: "Descanso" }, { UsuarioId: 2, ColaboradorId: 2018 });
  const { parametros: p } = bd.auditorias[0];
  assert.equal(resultado.SolicitudId, 31);
  assert.equal(p.Entidad, "Vacaciones");
  assert.equal(p.Accion, "CREAR");
  assert.equal(p.RegistroId, 31);
  assert.equal(p.UsuarioId, 2);
  assert.equal(p.DatosAnteriores, null);
  assert.equal(bd.eventos.at(-1).tipo, "commit");
});

test("catálogos de vacaciones coinciden entre backend y frontend y permiten filtrar bitácoras", async (t) => {
  for (const clave of ["VACACIONES", "SALDOS_VACACIONES"]) assert.equal(entidadesBitacora[clave], entidades[clave]);
  for (const clave of ["APROBAR_REVISION_VACACIONES", "APROBAR_VACACIONES", "RECHAZAR_VACACIONES"]) {
    assert.equal(accionesBitacora[clave], acciones[clave]);
  }
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() { return this; },
    async query() { return { recordsets: [[{ Total: 0 }], []] }; },
  }));
  for (const accion of [acciones.APROBAR_REVISION_VACACIONES, acciones.APROBAR_VACACIONES, acciones.RECHAZAR_VACACIONES]) {
    assert.equal((await listarBitacoras({ entidad: entidades.VACACIONES, accion })).total, 0);
  }
});

test("el cálculo real exige la transacción de RH antes de consultar la base", async () => {
  const moduloReal = await import(`${urlCalculo}?sinSimulacion`);
  await assert.rejects(moduloReal.registrarCalculoVacaciones(solicitudBase, null, 7), { status: 500 });
});
