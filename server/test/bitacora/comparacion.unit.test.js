import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
import { obtenerComparacionBitacora } from "../../../client/src/utils/bitacoraUtils.js";
const anteriores = {
  SolicitudId: 11,
  Estado: "EN_REVISION_RH",
  FechaInicio: "2026-10-21T00:00:00.000Z",
  ComprobanteNombre: "comprobante.png",
  Observacion: "Revisada por gerencia"
};
const actualizada = {
  SolicitudId: 11,
  Estado: "APROBADA",
  Observacion: null
};
const calculo = {
  CalculoId: 3,
  SolicitudId: 11,
  MinutosReconocidos: 0
};
for (const historica of [true, false]) {
  test(`compara aprobación ${historica ? "histórica" : "actual"} y separa el cálculo`, () => {
    const evento = {
      Entidad: "SolicitudesIncapacidades",
      Accion: "APROBAR_INCAPACIDAD",
      DatosAnteriores: anteriores,
      DatosNuevos: historica ? {
        incapacidadActualizada: actualizada,
        registroCalculoCreado: calculo
      } : {
        ...anteriores,
        ...actualizada,
        registroCalculoCreado: calculo
      }
    };
    const original = structuredClone(evento);
    expect(obtenerComparacionBitacora(evento)).toEqual({
      anteriores,
      nuevos: {
        ...anteriores,
        ...actualizada
      },
      calculo
    });
    expect(evento).toEqual(original);
  });
}
test("revisión histórica del gerente conserva datos sin modificar y respeta valores nulos", () => {
  const resultado = obtenerComparacionBitacora({
    Entidad: "SolicitudesIncapacidades",
    Accion: "RECHAZAR_INCAPACIDAD",
    DatosAnteriores: anteriores,
    DatosNuevos: {
      ...actualizada,
      Estado: "RECHAZADA"
    }
  });
  expect(resultado.nuevos.ComprobanteNombre).toBe(anteriores.ComprobanteNombre);
  expect(resultado.nuevos.Estado).toBe("RECHAZADA");
  expect(resultado.nuevos.Observacion).toBe(null);
  expect(resultado.calculo).toBe(null);
});
test("otras entidades conservan campos eliminados sin rellenarlos", () => {
  const resultado = obtenerComparacionBitacora({
    Entidad: "Usuarios",
    Accion: "ACTUALIZAR",
    DatosAnteriores: {
      Nombre: "Anterior"
    },
    DatosNuevos: {}
  });
  expect(resultado.nuevos).toEqual({});
  expect(obtenerComparacionBitacora(null)).toEqual({
    anteriores: {},
    nuevos: {},
    calculo: null
  });
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
