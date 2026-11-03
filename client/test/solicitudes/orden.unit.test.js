import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
import { ordenarSolicitudesPorEstado } from "../../src/utils/solicitudUtils.js";
const solicitudes = Object.freeze([Object.freeze({
  SolicitudId: 10,
  Estado: "APROBADA"
}), Object.freeze({
  SolicitudId: 11,
  Estado: "EN_REVISION_RH"
}), Object.freeze({
  SolicitudId: 12,
  Estado: "PENDIENTE"
}), Object.freeze({
  SolicitudId: 13,
  Estado: "RECHAZADA"
}), Object.freeze({
  SolicitudId: 14,
  Estado: "PENDIENTE"
}), Object.freeze({
  SolicitudId: 15,
  Estado: "EN_REVISION_RH"
})]);
const ids = lista => lista.map(solicitud => solicitud.SolicitudId);
test("Gerencia: pendientes primero, luego revisión de RH y después las resueltas", () => {
  expect(ids(ordenarSolicitudesPorEstado(solicitudes, "GERENTE"))).toEqual([12, 14, 11, 15, 10, 13]);
});
for (const rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
  test(`${rol}: revisión de RH primero, luego pendientes y después las resueltas`, () => {
    expect(ids(ordenarSolicitudesPorEstado(solicitudes, rol))).toEqual([11, 15, 12, 14, 10, 13]);
  });
}
for (const rol of ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
  test(`permisos y extras para ${rol}: pendientes primero y todas las resueltas conservadas`, () => {
    const permisosOExtras = solicitudes.filter(solicitud => solicitud.Estado !== "EN_REVISION_RH");
    expect(ids(ordenarSolicitudesPorEstado(permisosOExtras, rol))).toEqual([12, 14, 10, 13]);
  });
}
test("el colaborador y los roles sin prioridad conservan el orden recibido", () => {
  for (const rol of ["COLABORADOR", "DESCONOCIDO", undefined]) {
    expect(ordenarSolicitudesPorEstado(solicitudes, rol)).toEqual(solicitudes);
  }
});
test("no modifica ni pierde los datos originales y conserva el orden dentro de cada prioridad", () => {
  const resultado = ordenarSolicitudesPorEstado(solicitudes, "GERENTE");
  assert.notEqual(resultado, solicitudes);
  expect(ids(solicitudes)).toEqual([10, 11, 12, 13, 14, 15]);
  expect(resultado.length).toBe(solicitudes.length);
  for (const solicitud of solicitudes) expect(resultado.includes(solicitud)).toBeTruthy();
});
test("sin datos cargados devuelve un array vacío para cualquier rol", () => {
  for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    for (const datos of [null, undefined, []]) {
      expect(ordenarSolicitudesPorEstado(datos, rol)).toEqual([]);
    }
  }
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
