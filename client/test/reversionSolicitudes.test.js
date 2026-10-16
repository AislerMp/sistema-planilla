import assert from "node:assert/strict";
import { test } from "node:test";
import {
  puedeRevertirSolicitudFutura,
  obtenerEstadoReversionIncapacidad,
  validarMotivoReversion,
} from "../src/utils/reversionSolicitudes.js";

for (const Estado of ["APROBADA", "RECHAZADA"]) {
  test(`permisos/extras ${Estado}: solo gerente y fecha futura de Costa Rica`, (t) => {
    // Todavía es 12 de octubre en Costa Rica, aunque UTC ya sea 13.
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-13T05:59:59Z") });
    const solicitud = { Estado, FechaSolicitada: "2026-10-13T00:00:00.000Z" };
    assert.equal(puedeRevertirSolicitudFutura(solicitud, "GERENTE"), true);
    for (const rol of ["COLABORADOR", "RECURSOS_HUMANOS", "ADMINISTRADOR", undefined]) {
      assert.equal(puedeRevertirSolicitudFutura(solicitud, rol), false);
    }
    assert.equal(puedeRevertirSolicitudFutura({ Estado, FechaSolicitada: "2026-10-12" }, "GERENTE"), false);
    assert.equal(puedeRevertirSolicitudFutura({ Estado, FechaSolicitada: "2026-10-11" }, "GERENTE"), false);
    t.mock.timers.setTime(new Date("2026-10-13T06:00:00Z").getTime());
    assert.equal(puedeRevertirSolicitudFutura(solicitud, "GERENTE"), false);
  });
}

test("permisos/extras pendientes, ausentes o sin fecha no ofrecen reversión", () => {
  assert.equal(puedeRevertirSolicitudFutura({ Estado: "PENDIENTE", FechaSolicitada: "2099-10-13" }, "GERENTE"), false);
  assert.equal(puedeRevertirSolicitudFutura(null, "GERENTE"), false);
  assert.equal(puedeRevertirSolicitudFutura({ Estado: "APROBADA" }, "GERENTE"), false);
});

for (const [Estado, rol, gerente, rh, destino] of [
  ["EN_REVISION_RH", "GERENTE", 4, null, "PENDIENTE"],
  ["RECHAZADA", "GERENTE", 4, null, "PENDIENTE"],
  ["RECHAZADA", "RECURSOS_HUMANOS", 4, 7, "EN_REVISION_RH"],
  ["EN_REVISION_RH", "GERENTE", null, null, null],
  ["EN_REVISION_RH", "GERENTE", 4, 7, null],
  ["RECHAZADA", "GERENTE", 4, 7, null],
  ["RECHAZADA", "RECURSOS_HUMANOS", 4, null, null],
  ["RECHAZADA", "RECURSOS_HUMANOS", null, 7, null],
  ["EN_REVISION_RH", "RECURSOS_HUMANOS", 4, null, null],
  ["PENDIENTE", "GERENTE", 4, null, null],
  ["RECHAZADA", "ADMINISTRADOR", 4, 7, null],
  ["RECHAZADA", "COLABORADOR", 4, null, null],
]) {
  test(`incapacidad ${Estado}, ${rol}, revisores ${gerente}/${rh}: ${destino ?? "sin reversión"}`, () => {
    assert.equal(obtenerEstadoReversionIncapacidad({
      Estado, RevisadoPorGerenteId: gerente, RevisadoPorRhId: rh,
      FechaInicio: "2020-01-01", FechaFin: "2020-01-02",
    }, rol), destino);
  });
}

test("ninguna incapacidad aprobada ofrece reversión, independientemente del rol y revisiones", () => {
  for (const rol of ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR", "COLABORADOR"]) {
    for (const RevisadoPorRhId of [null, 7]) {
      assert.equal(obtenerEstadoReversionIncapacidad({ Estado: "APROBADA", RevisadoPorGerenteId: 4, RevisadoPorRhId }, rol), null);
    }
  }
  assert.equal(obtenerEstadoReversionIncapacidad(null, "GERENTE"), null);
});

test("motivo obligatorio, sin aceptar solo espacios y con máximo 500 caracteres", () => {
  for (const motivo of ["", " \n\t ", null, undefined]) {
    assert.ok(validarMotivoReversion(motivo));
  }
  assert.equal(validarMotivoReversion(" Corrección de resolución "), null);
  assert.equal(validarMotivoReversion("a".repeat(500)), null);
  assert.ok(validarMotivoReversion("a".repeat(501)));
});
