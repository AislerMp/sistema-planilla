import assert from "node:assert/strict";
import { test } from "node:test";
import { ordenarSolicitudesPorEstado } from "../src/utils/solicitudUtils.js";

const solicitudes = Object.freeze([
  Object.freeze({ SolicitudId: 10, Estado: "APROBADA" }),
  Object.freeze({ SolicitudId: 11, Estado: "EN_REVISION_RH" }),
  Object.freeze({ SolicitudId: 12, Estado: "PENDIENTE" }),
  Object.freeze({ SolicitudId: 13, Estado: "RECHAZADA" }),
  Object.freeze({ SolicitudId: 14, Estado: "PENDIENTE" }),
  Object.freeze({ SolicitudId: 15, Estado: "EN_REVISION_RH" }),
]);
const ids = (lista) => lista.map((solicitud) => solicitud.SolicitudId);

test("Gerencia: pendientes primero, luego revisión de RH y después las resueltas", () => {
  assert.deepEqual(
    ids(ordenarSolicitudesPorEstado(solicitudes, "GERENTE")),
    [12, 14, 11, 15, 10, 13],
  );
});

for (const rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
  test(`${rol}: revisión de RH primero, luego pendientes y después las resueltas`, () => {
    assert.deepEqual(
      ids(ordenarSolicitudesPorEstado(solicitudes, rol)),
      [11, 15, 12, 14, 10, 13],
    );
  });
}

for (const rol of ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
  test(`permisos y extras para ${rol}: pendientes primero y todas las resueltas conservadas`, () => {
    const permisosOExtras = solicitudes.filter((solicitud) => solicitud.Estado !== "EN_REVISION_RH");
    assert.deepEqual(
      ids(ordenarSolicitudesPorEstado(permisosOExtras, rol)),
      [12, 14, 10, 13],
    );
  });
}

test("el colaborador y los roles sin prioridad conservan el orden recibido", () => {
  for (const rol of ["COLABORADOR", "DESCONOCIDO", undefined]) {
    assert.deepEqual(ordenarSolicitudesPorEstado(solicitudes, rol), solicitudes);
  }
});

test("no modifica ni pierde los datos originales y conserva el orden dentro de cada prioridad", () => {
  const resultado = ordenarSolicitudesPorEstado(solicitudes, "GERENTE");
  assert.notEqual(resultado, solicitudes);
  assert.deepEqual(ids(solicitudes), [10, 11, 12, 13, 14, 15]);
  assert.equal(resultado.length, solicitudes.length);
  for (const solicitud of solicitudes) assert.ok(resultado.includes(solicitud));
});

test("sin datos cargados devuelve un array vacío para cualquier rol", () => {
  for (const rol of ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    for (const datos of [null, undefined, []]) {
      assert.deepEqual(ordenarSolicitudesPorEstado(datos, rol), []);
    }
  }
});
