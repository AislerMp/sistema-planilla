import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
import { puedeRevertirSolicitudFutura, obtenerEstadoReversionIncapacidad, validarMotivoReversion } from "../../src/utils/reversionSolicitudes.js";
for (const Estado of ["APROBADA", "RECHAZADA"]) {
  test(`permisos/extras ${Estado}: solo gerente y fecha futura de Costa Rica`, () => {
    // Todavía es 12 de octubre en Costa Rica, aunque UTC ya sea 13.
    jest.useFakeTimers({
      now: new Date("2026-10-13T05:59:59Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const solicitud = {
      Estado,
      FechaSolicitada: "2026-10-13T00:00:00.000Z"
    };
    expect(puedeRevertirSolicitudFutura(solicitud, "GERENTE")).toBe(true);
    for (const rol of ["COLABORADOR", "RECURSOS_HUMANOS", "ADMINISTRADOR", undefined]) {
      expect(puedeRevertirSolicitudFutura(solicitud, rol)).toBe(false);
    }
    expect(puedeRevertirSolicitudFutura({
      Estado,
      FechaSolicitada: "2026-10-12"
    }, "GERENTE")).toBe(false);
    expect(puedeRevertirSolicitudFutura({
      Estado,
      FechaSolicitada: "2026-10-11"
    }, "GERENTE")).toBe(false);
    jest.setSystemTime(new Date("2026-10-13T06:00:00Z").getTime());
    expect(puedeRevertirSolicitudFutura(solicitud, "GERENTE")).toBe(false);
  });
}
test("permisos/extras pendientes, ausentes o sin fecha no ofrecen reversión", () => {
  expect(puedeRevertirSolicitudFutura({
    Estado: "PENDIENTE",
    FechaSolicitada: "2099-10-13"
  }, "GERENTE")).toBe(false);
  expect(puedeRevertirSolicitudFutura(null, "GERENTE")).toBe(false);
  expect(puedeRevertirSolicitudFutura({
    Estado: "APROBADA"
  }, "GERENTE")).toBe(false);
});
for (const [Estado, rol, gerente, rh, destino] of [["EN_REVISION_RH", "GERENTE", 4, null, "PENDIENTE"], ["RECHAZADA", "GERENTE", 4, null, "PENDIENTE"], ["RECHAZADA", "RECURSOS_HUMANOS", 4, 7, "EN_REVISION_RH"], ["EN_REVISION_RH", "GERENTE", null, null, null], ["EN_REVISION_RH", "GERENTE", 4, 7, null], ["RECHAZADA", "GERENTE", 4, 7, null], ["RECHAZADA", "RECURSOS_HUMANOS", 4, null, null], ["RECHAZADA", "RECURSOS_HUMANOS", null, 7, null], ["EN_REVISION_RH", "RECURSOS_HUMANOS", 4, null, null], ["PENDIENTE", "GERENTE", 4, null, null], ["RECHAZADA", "ADMINISTRADOR", 4, 7, null], ["RECHAZADA", "COLABORADOR", 4, null, null]]) {
  test(`incapacidad ${Estado}, ${rol}, revisores ${gerente}/${rh}: ${destino ?? "sin reversión"}`, () => {
    expect(obtenerEstadoReversionIncapacidad({
      Estado,
      RevisadoPorGerenteId: gerente,
      RevisadoPorRhId: rh,
      FechaInicio: "2020-01-01",
      FechaFin: "2020-01-02"
    }, rol)).toBe(destino);
  });
}
test("ninguna incapacidad aprobada ofrece reversión, independientemente del rol y revisiones", () => {
  for (const rol of ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR", "COLABORADOR"]) {
    for (const RevisadoPorRhId of [null, 7]) {
      expect(obtenerEstadoReversionIncapacidad({
        Estado: "APROBADA",
        RevisadoPorGerenteId: 4,
        RevisadoPorRhId
      }, rol)).toBe(null);
    }
  }
  expect(obtenerEstadoReversionIncapacidad(null, "GERENTE")).toBe(null);
});
test("motivo obligatorio, sin aceptar solo espacios y con máximo 500 caracteres", () => {
  for (const motivo of ["", " \n\t ", null, undefined]) {
    expect(validarMotivoReversion(motivo)).toBeTruthy();
  }
  expect(validarMotivoReversion(" Corrección de resolución ")).toBe(null);
  expect(validarMotivoReversion("a".repeat(500))).toBe(null);
  expect(validarMotivoReversion("a".repeat(501))).toBeTruthy();
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
