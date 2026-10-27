import assert from "node:assert/strict";
import { test } from "node:test";
import { distribuirMinutos, mostrarDuracion, puedeAjustarAsistencia, obtenerRangoAsistencias } from "../src/utils/asistenciaUtils.js";

test("un período sin asistencias conserva todas sus fechas y la semana seleccionada", () => {
  const periodo = { FechaInicio: "2026-10-12T00:00:00Z", FechaFin: "2026-10-25T00:00:00Z" };
  assert.deepEqual(obtenerRangoAsistencias({ periodoId: 22 }, periodo, []), { desde: "2026-10-12", hasta: "2026-10-25" });
  assert.deepEqual(obtenerRangoAsistencias({ periodoId: 22, desde: "2026-10-19", hasta: "2026-10-25" }, periodo, []), { desde: "2026-10-19", hasta: "2026-10-25" });
});

test("las consultas vacías por fecha conservan el rango y solo hasta representa un día", () => {
  assert.deepEqual(obtenerRangoAsistencias({ desde: "2026-10-12", hasta: "2026-10-14" }), { desde: "2026-10-12", hasta: "2026-10-14" });
  assert.deepEqual(obtenerRangoAsistencias({ hasta: "2026-10-25" }), { desde: "2026-10-25", hasta: "2026-10-25" });
  assert.deepEqual(obtenerRangoAsistencias({ desde: "2099-01-01" }, undefined, [], new Date("2026-10-26T18:00:00Z")), { desde: "2099-01-01", hasta: "2099-01-01" });
});

test("la semana sin registros coincide con el corte de marcas en Costa Rica", () => {
  assert.deepEqual(obtenerRangoAsistencias({}, undefined, [], new Date("2026-10-26T09:59:59Z")), { desde: "2026-10-19", hasta: "2026-10-25" });
  assert.deepEqual(obtenerRangoAsistencias({}, undefined, [], new Date("2026-10-26T10:00:00Z")), { desde: "2026-10-26", hasta: "2026-10-26" });
});

for (const [jornada, limite, ordinarios, extras] of [
  ["diurna", 480, 480, 120],
  ["mixta", 420, 420, 180],
  ["nocturna", 360, 360, 240],
  ["sin clasificar con límite del servidor", 480, 480, 120],
  ["configuración distinta enviada por el servidor", 450, 450, 150],
]) {
  test(`600 minutos, ${jornada}: conserva el total y separa una sola vez`, () => {
    const resultado = distribuirMinutos(600, limite);
    assert.deepEqual(resultado, { minutosOrdinarios: ordinarios, minutosExtras: extras });
    assert.equal(resultado.minutosOrdinarios + resultado.minutosExtras, 600);
  });

  test(`${jornada}: exactamente el límite y cero`, () => {
    assert.deepEqual(distribuirMinutos(limite, limite), { minutosOrdinarios: limite, minutosExtras: 0 });
    assert.deepEqual(distribuirMinutos(0, limite), { minutosOrdinarios: 0, minutosExtras: 0 });
  });
}

test("no inventa un límite cuando falta o es inválido", () => {
  for (const limite of [undefined, null, "480", 0, -1, 1.5, NaN, Infinity]) {
    assert.equal(distribuirMinutos(600, limite), null);
  }
  for (const minutos of [undefined, null, "600", -1, 1.5, NaN, Infinity]) {
    assert.equal(distribuirMinutos(minutos, 420), null);
  }
});

test("muestra límites con horas y minutos, incluidos límites fraccionarios de hora", () => {
  assert.equal(mostrarDuracion(420), "7 h 0 min");
  assert.equal(mostrarDuracion(450), "7 h 30 min");
});

test("el período debe permitir ajustes y su último día es inclusivo", () => {
  for (const EstadoPeriodo of ["ABIERTO", "EN_REVISION"]) {
    const asistencia = { EstadoPeriodo, FechaLimiteAjustes: "2026-10-28T00:00:00.000Z" };
    assert.equal(puedeAjustarAsistencia(asistencia, "2026-10-28"), true);
    assert.equal(puedeAjustarAsistencia(asistencia, "2026-10-29"), false);
  }
  for (const EstadoPeriodo of ["PROGRAMADO", "CERRADO", "PAGADO", undefined]) {
    assert.equal(puedeAjustarAsistencia({ EstadoPeriodo, FechaLimiteAjustes: "2099-12-31" }, "2026-10-26"), false);
  }
  assert.equal(puedeAjustarAsistencia({ EstadoPeriodo: "ABIERTO" }, "2026-10-26"), false);
});
