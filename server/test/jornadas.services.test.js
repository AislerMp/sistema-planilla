import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { registrarSalida } = await import("../src/modules/marcas/marcas.service.js");
const { sincronizarHorasExtras, actualizarHorasExtra } = await import(
  "../src/modules/extras/horasExtras.service.js"
);
const { ajustarMinutosAsistencia } = await import(
  "../src/modules/asistenciasDiarias/asistenciasDiarias.service.js"
);
const { registrarCalculoIncapacidad } = await import(
  "../src/modules/incapacidades/services/calculoIncapacidades.services.js"
);

const fecha = new Date("2026-10-25T00:00:00Z");
const hora = (valor) => new Date(`2026-10-25T${valor}:00-06:00`);
const marca = (entrada, salida = null) => ({
  FechaHoraEntrada: hora(entrada), FechaHoraSalida: salida ? hora(salida) : null,
});
const colaborador = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
const gerente = { UsuarioId: 8, Rol: "GERENTE" };

// Repositorios y servicios reales con transporte SQL simulado. No es SQL Server.
function preparar(t, opciones = {}) {
  const asistencia = {
    AsistenciaId: 3, ColaboradorId: 4, RestauranteId: 2, PeriodoId: 1,
    FechaAsignada: fecha, TipoJornada: null,
    MinutosCalculados: 0, MinutosAjustados: null,
    ...opciones.asistencia,
  };
  const intervalos = (opciones.intervalos ?? []).map((intervalo, i) => ({
    MarcaId: i + 1, ColaboradorId: 4, FechaAsignada: fecha,
    NumeroIntervalo: i + 1, ...intervalo,
  }));
  let extras = opciones.extras ? { ...opciones.extras } : null;
  const consultas = [];
  const bitacoras = [];

  function request(transaction = null) {
    const parametros = {};
    return {
      input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
      async query(query) {
        consultas.push({ query, parametros, transaction });
        if (query.includes("FROM Usuarios")) return { recordset: [{ RestauranteId: 2 }] };
        if (query.includes("FROM Colaboradores") || query.includes("FROM dbo.Colaboradores")) {
          return { recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }] };
        }
        if (query.includes("FROM dbo.PeriodosPlanilla")) return { recordset: [{
          PeriodoId: 1, Estado: "ABIERTO", FechaLimiteAjustes: new Date("2099-12-31"),
        }] };
        if (query.includes("FROM dbo.Solicitudes AS s") && query.includes("INNER JOIN dbo.Incapacidades")) {
          return { recordset: [{ SolicitudId: 31, ColaboradorId: 4, Estado: "APROBADA", FechaInicio: fecha }] };
        }
        if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
          return { recordset: [{ CalculoId: 5, ...parametros }] };
        }
        if (/FROM dbo\.(PermisosLaborales|Incapacidades|Vacaciones|SaldosVacaciones|CalculosIncapacidad)/.test(query)) {
          return { recordset: [] };
        }
        if (query.includes("UPDATE dbo.MarcasAsistencia")) {
          const intervalo = intervalos.find((m) => m.MarcaId === parametros.marcaId);
          intervalo.FechaHoraSalida = parametros.fechaHoraSalida;
          return { recordset: [{ ...intervalo }] };
        }
        if (query.includes("FROM dbo.MarcasAsistencia")) {
          const filas = query.includes("FechaHoraSalida IS NULL")
            ? intervalos.filter((m) => m.FechaHoraSalida == null) : intervalos;
          return { recordset: filas.map((m) => ({ ...m })) };
        }
        if (query.includes("UPDATE dbo.AsistenciasDiarias")) {
          if (query.includes("SET TipoJornada")) {
            if (opciones.fallaClasificacion) return { recordset: [] };
            asistencia.TipoJornada = parametros.TipoJornada;
          } else if (query.includes("SET MinutosCalculados")) {
            asistencia.MinutosCalculados = parametros.Minutos;
          } else {
            asistencia.MinutosAjustados = parametros.Minutos;
          }
          return { recordset: [{ ...asistencia }] };
        }
        if (query.includes("FROM dbo.AsistenciasDiarias")) {
          return { recordset: [{
            ...asistencia,
            MinutosEfectivos: asistencia.MinutosAjustados ?? asistencia.MinutosCalculados,
          }] };
        }
        if (query.includes("FROM dbo.HorasExtras")) return { recordset: extras ? [{ ...extras }] : [] };
        if (query.includes("INSERT INTO dbo.HorasExtras")) {
          assert.equal(extras, null, "No debe duplicar el registro de extras");
          extras = { HoraExtraId: 9, AsistenciaId: 3, MinutosDetectados: parametros.minutosDetectados, MinutosAjustados: null };
          return { recordset: [{ ...extras }] };
        }
        if (query.includes("UPDATE dbo.HorasExtras")) {
          if (query.includes("SET MinutosDetectados")) {
            extras.MinutosDetectados = parametros.minutosDetectados;
            if (parametros.restablecerAjuste) extras.MinutosAjustados = null;
          } else {
            extras.MinutosAjustados = parametros.minutosAjustados;
          }
          return { recordset: [{ ...extras }] };
        }
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          bitacoras.push(parametros);
          if (opciones.fallaBitacoraExtras && parametros.Entidad === "HorasExtras") {
            throw new Error("Fallo de bitácora de extras");
          }
          return { rowsAffected: [1] };
        }
        assert.fail(`Consulta no simulada: ${query}`);
      },
    };
  }

  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => request());
  t.mock.method(sql.Transaction.prototype, "request", function () { return request(this); });
  t.mock.method(sql.Transaction.prototype, "begin", async () => {});
  const commit = t.mock.method(sql.Transaction.prototype, "commit", async () => {});
  const rollback = t.mock.method(sql.Transaction.prototype, "rollback", async () => {});

  return { asistencia, intervalos, consultas, bitacoras, commit, rollback, get extras() { return extras; } };
}

for (const [nombre, intervalos, salida, tipo, total, ordinarios, extraordinarios] of [
  ["diurna", [marca("08:00", "12:00"), marca("13:00")], "17:00", "DIURNA", 480, 480, 0],
  ["mixta", [marca("13:00", "16:00"), marca("17:00")], "22:00", "MIXTA", 480, 420, 60],
  ["nocturna sin extras", [marca("17:00")], "23:00", "NOCTURNA", 360, 360, 0],
  ["nocturna con extras", [marca("16:00")], "23:00", "NOCTURNA", 420, 360, 60],
]) {
  test(`salida ${nombre}: clasifica y separa minutos en la misma transacción`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: hora(salida) });
    const bd = preparar(t, { intervalos });
    const resultado = await registrarSalida(colaborador);
    assert.equal(resultado.asistencia.TipoJornada, tipo);
    assert.equal(resultado.asistencia.MinutosCalculados, total);
    assert.equal(resultado.asistencia.MinutosEfectivos, ordinarios);
    assert.equal(bd.extras?.MinutosDetectados ?? 0, extraordinarios);
    assert.equal(bd.commit.mock.callCount(), 1);
    assert.equal(bd.rollback.mock.callCount(), 0);
    const escrituras = bd.consultas.filter((c) => /\b(UPDATE|INSERT)\b/.test(c.query));
    assert.ok(escrituras.every((c) => c.transaction === escrituras[0].transaction));
  });
}

test("segunda salida cambia DIURNA a MIXTA y luego repetir sincronización no modifica nada", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: hora("16:00") });
  const bd = preparar(t, { intervalos: [marca("13:00")] });
  await registrarSalida(colaborador);
  assert.equal(bd.asistencia.TipoJornada, "DIURNA");
  assert.equal(bd.extras, null);
  bd.intervalos.push({ MarcaId: 2, ...marca("17:00") });
  t.mock.timers.setTime(hora("22:00").getTime());
  const resultado = await registrarSalida(colaborador);
  assert.equal(bd.asistencia.TipoJornada, "MIXTA");
  assert.equal(bd.asistencia.MinutosCalculados, 480);
  assert.equal(bd.asistencia.MinutosAjustados, 420);
  assert.equal(bd.extras.MinutosDetectados, 60);
  const escriturasAntes = bd.consultas.filter((c) => /\b(INSERT|UPDATE)\b/.test(c.query)).length;
  await sincronizarHorasExtras(resultado.asistencia, 7, new sql.Transaction(pool));
  assert.equal(bd.consultas.filter((c) => /\b(INSERT|UPDATE)\b/.test(c.query)).length, escriturasAntes);
  assert.equal(bd.extras.MinutosDetectados, 60);
});

test("salida después de medianoche conserva fecha asignada y no cuenta intervalos abiertos", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-26T02:00:00-06:00") });
  const bd = preparar(t, { intervalos: [marca("22:00")] });
  const resultado = await registrarSalida(colaborador);
  assert.equal(resultado.asistencia.TipoJornada, "NOCTURNA");
  assert.equal(resultado.asistencia.MinutosCalculados, 240);
  assert.equal(bd.extras, null);
  const consultaMarcas = bd.consultas.find((c) => c.query.includes("FechaHoraSalida IS NULL"));
  assert.equal(consultaMarcas.parametros.fechaAsignada.toISOString(), fecha.toISOString());
});

test("segunda salida pasa de MIXTA a NOCTURNA sin sumar desde las ordinarias ya recortadas", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: hora("20:30") });
  const bd = preparar(t, { intervalos: [marca("13:00")] });
  await registrarSalida(colaborador);
  assert.equal(bd.asistencia.TipoJornada, "MIXTA");
  assert.equal(bd.asistencia.MinutosCalculados, 450);
  assert.equal(bd.asistencia.MinutosAjustados, 420);
  assert.equal(bd.extras.MinutosDetectados, 30);

  bd.intervalos.push({ MarcaId: 2, ...marca("21:00") });
  t.mock.timers.setTime(hora("23:00").getTime());
  const resultado = await registrarSalida(colaborador);
  assert.equal(resultado.asistencia.TipoJornada, "NOCTURNA");
  assert.equal(bd.asistencia.MinutosCalculados, 570);
  assert.equal(bd.asistencia.MinutosAjustados, 360);
  assert.equal(bd.extras.MinutosDetectados, 210);
});

for (const tipo of ["DIURNA", "MIXTA", "NOCTURNA", null]) {
  test(`ajuste manual con jornada ${tipo}: usa el total ingresado y permite repetir`, async (t) => {
    const bd = preparar(t, { asistencia: { TipoJornada: tipo, MinutosCalculados: 660 } });
    const limite = tipo === "MIXTA" ? 420 : tipo === "NOCTURNA" ? 360 : 480;
    const resultado = await ajustarMinutosAsistencia(3, 600, "Corrección", gerente);
    assert.equal(resultado.MinutosEfectivos, limite);
    assert.equal(bd.asistencia.MinutosCalculados, 660);
    assert.equal(bd.extras.MinutosDetectados, 600 - limite);
    const escriturasAntes = bd.consultas.filter((c) => /\b(INSERT|UPDATE)\b/.test(c.query)).length;
    await sincronizarHorasExtras(resultado, 8, new sql.Transaction(pool), 600);
    assert.equal(bd.consultas.filter((c) => /\b(INSERT|UPDATE)\b/.test(c.query)).length, escriturasAntes);
    assert.equal(bd.asistencia.TipoJornada, tipo);
  });

  test(`ajuste de extras con jornada ${tipo} utiliza su límite y conserva el total registrado`, async (t) => {
    const bd = preparar(t, { asistencia: { TipoJornada: tipo, MinutosCalculados: 600 } });
    const limite = tipo === "MIXTA" ? 420 : tipo === "NOCTURNA" ? 360 : 480;
    await actualizarHorasExtra(3, 90, "Corrección", gerente);
    assert.equal(bd.asistencia.MinutosCalculados, 600);
    assert.equal(bd.asistencia.MinutosAjustados, limite);
    assert.equal(bd.extras.MinutosDetectados, 600 - limite);
    assert.equal(bd.extras.MinutosAjustados, 90);
    await actualizarHorasExtra(3, 0, "Sin extras", gerente);
    assert.equal(bd.asistencia.MinutosAjustados, limite);
    assert.equal(bd.extras.MinutosAjustados, 0);
    assert.equal(bd.asistencia.TipoJornada, tipo);
  });

  test(`incapacidad anula asistencia y extras para jornada ${tipo}, sin confirmar la transacción`, async (t) => {
    const bd = preparar(t, {
      asistencia: { TipoJornada: tipo, MinutosCalculados: 600, MinutosAjustados: 360 },
      extras: { HoraExtraId: 9, AsistenciaId: 3, MinutosDetectados: 240, MinutosAjustados: 60 },
    });
    await registrarCalculoIncapacidad(
      { SolicitudId: 31 }, { minutosReconocidos: 240, porcentajePatronalAplicado: 50 },
      new sql.Transaction(pool), 8,
    );
    assert.equal(bd.asistencia.MinutosCalculados, 600);
    assert.equal(bd.asistencia.MinutosAjustados, 0);
    assert.equal(bd.extras.MinutosDetectados, 0);
    assert.equal(bd.extras.MinutosAjustados, null);
    assert.equal(bd.commit.mock.callCount(), 0);
    assert.equal(bd.rollback.mock.callCount(), 0);
  });
}

test("ajustar una asistencia a cero elimina también las extras manuales", async (t) => {
  const bd = preparar(t, {
    asistencia: { TipoJornada: "MIXTA", MinutosCalculados: 480, MinutosAjustados: 420 },
    extras: { HoraExtraId: 9, AsistenciaId: 3, MinutosDetectados: 60, MinutosAjustados: 30 },
  });
  const resultado = await ajustarMinutosAsistencia(3, 0, "Corrección", gerente);
  assert.equal(resultado.MinutosEfectivos, 0);
  assert.equal(bd.extras.MinutosDetectados, 0);
  assert.equal(bd.extras.MinutosAjustados, null);
});

for (const opciones of [{ fallaClasificacion: true }, { fallaBitacoraExtras: true }]) {
  test(`salida revierte si falla ${Object.keys(opciones)[0]}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: hora("23:00") });
    const bd = preparar(t, { ...opciones, intervalos: [marca("16:00")] });
    t.mock.method(console, "error", () => {});
    await assert.rejects(registrarSalida(colaborador));
    assert.equal(bd.commit.mock.callCount(), 0);
    assert.equal(bd.rollback.mock.callCount(), 1);
  });
}
