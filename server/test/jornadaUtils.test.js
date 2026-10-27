import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  clasificarJornada,
  obtenerLimiteOrdinarioMinutos,
} from "../src/shared/utils/jornadaUtils.js";

const marca = (entrada, salida) => ({
  FechaHoraEntrada: new Date(`2026-10-25T${entrada}:00-06:00`),
  FechaHoraSalida: salida ? new Date(`2026-10-25T${salida}:00-06:00`) : null,
});

for (const [nombre, intervalos, tipoJornada, limite] of [
  ["dos intervalos diurnos sin contar el descanso", [marca("08:00", "12:00"), marca("13:00", "17:00")], "DIURNA", 480],
  ["mixta con 180 minutos nocturnos", [marca("13:00", "16:00"), marca("17:00", "22:00")], "MIXTA", 420],
  ["17 a 23 alcanza 240 minutos nocturnos", [marca("17:00", "23:00")], "NOCTURNA", 360],
  ["16 a 23 también es nocturna", [marca("16:00", "23:00")], "NOCTURNA", 360],
  ["210 minutos nocturnos exactos", [marca("16:00", "22:30")], "NOCTURNA", 360],
  ["209 minutos nocturnos", [marca("16:00", "22:29")], "MIXTA", 420],
  ["todo nocturno aunque dure menos de 210 minutos", [marca("20:00", "22:00")], "NOCTURNA", 360],
  ["05:00 y 19:00 delimitan la ventana diurna", [marca("05:00", "19:00")], "DIURNA", 480],
  ["un intervalo pendiente no cambia la clasificación", [marca("08:00", "12:00"), marca("18:00", null)], "DIURNA", 480],
  ["sin marcas", [], null, null],
  ["sin salida", [marca("08:00", null)], null, null],
  ["intervalo de duración cero", [marca("08:00", "08:00")], null, null],
]) {
  test(nombre, () => {
    assert.deepEqual(clasificarJornada(intervalos), {
      tipoJornada, limiteOrdinarioMinutos: limite,
    });
  });
}

test("cruza medianoche y distingue también el amanecer", () => {
  const intervalo = {
    FechaHoraEntrada: new Date("2026-10-25T22:00:00-06:00"),
    FechaHoraSalida: new Date("2026-10-26T02:00:00-06:00"),
  };
  assert.equal(clasificarJornada([intervalo]).tipoJornada, "NOCTURNA");
  intervalo.FechaHoraEntrada = new Date("2026-10-26T04:00:00-06:00");
  intervalo.FechaHoraSalida = new Date("2026-10-26T06:00:00-06:00");
  assert.equal(clasificarJornada([intervalo]).tipoJornada, "MIXTA");
});

test("NULL usa compatibilidad de 480 sin asignar una jornada", () => {
  assert.equal(obtenerLimiteOrdinarioMinutos(null), 480);
  assert.equal(obtenerLimiteOrdinarioMinutos(undefined), 480);
  assert.throws(() => obtenerLimiteOrdinarioMinutos("OTRA"), { status: 500 });
});

test("rechaza marcas completas inválidas o invertidas", () => {
  assert.throws(() => clasificarJornada([marca("17:00", "16:00")]), { status: 500 });
  assert.throws(() => clasificarJornada([{
    FechaHoraEntrada: new Date("inválida"), FechaHoraSalida: new Date(),
  }]), { status: 500 });
});

test("la clasificación no depende de la zona horaria del servidor", () => {
  const modulo = new URL("../src/shared/utils/jornadaUtils.js", import.meta.url).href;
  for (const TZ of ["UTC", "America/Costa_Rica", "Asia/Tokyo"]) {
    const resultado = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { clasificarJornada } from ${JSON.stringify(modulo)};
      const resultado = clasificarJornada([{
        FechaHoraEntrada: new Date("2026-10-25T19:00:00Z"),
        FechaHoraSalida: new Date("2026-10-26T04:00:00Z"),
      }]);
      process.stdout.write(resultado.tipoJornada);
    `], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(resultado.stdout, "MIXTA");
  }
});
