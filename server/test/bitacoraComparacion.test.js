import assert from "node:assert/strict";
import { test } from "node:test";
import { obtenerComparacionBitacora } from "../../client/src/utils/bitacoraUtils.js";

const anteriores = {
  SolicitudId: 11,
  Estado: "EN_REVISION_RH",
  FechaInicio: "2026-10-21T00:00:00.000Z",
  ComprobanteNombre: "comprobante.png",
  Observacion: "Revisada por gerencia",
};
const actualizada = { SolicitudId: 11, Estado: "APROBADA", Observacion: null };
const calculo = { CalculoId: 3, SolicitudId: 11, MinutosReconocidos: 0 };

for (const historica of [true, false]) {
  test(`compara aprobación ${historica ? "histórica" : "actual"} y separa el cálculo`, () => {
    const evento = {
      Entidad: "SolicitudesIncapacidades",
      Accion: "APROBAR_INCAPACIDAD",
      DatosAnteriores: anteriores,
      DatosNuevos: historica
        ? { incapacidadActualizada: actualizada, registroCalculoCreado: calculo }
        : { ...anteriores, ...actualizada, registroCalculoCreado: calculo },
    };
    const original = structuredClone(evento);
    assert.deepEqual(obtenerComparacionBitacora(evento), {
      anteriores,
      nuevos: { ...anteriores, ...actualizada },
      calculo,
    });
    assert.deepEqual(evento, original);
  });
}

test("revisión histórica del gerente conserva datos sin modificar y respeta valores nulos", () => {
  const resultado = obtenerComparacionBitacora({
    Entidad: "SolicitudesIncapacidades",
    Accion: "RECHAZAR_INCAPACIDAD",
    DatosAnteriores: anteriores,
    DatosNuevos: { ...actualizada, Estado: "RECHAZADA" },
  });
  assert.equal(resultado.nuevos.ComprobanteNombre, anteriores.ComprobanteNombre);
  assert.equal(resultado.nuevos.Estado, "RECHAZADA");
  assert.equal(resultado.nuevos.Observacion, null);
  assert.equal(resultado.calculo, null);
});

test("otras entidades conservan campos eliminados sin rellenarlos", () => {
  const resultado = obtenerComparacionBitacora({
    Entidad: "Usuarios",
    Accion: "ACTUALIZAR",
    DatosAnteriores: { Nombre: "Anterior" },
    DatosNuevos: {},
  });
  assert.deepEqual(resultado.nuevos, {});
  assert.deepEqual(obtenerComparacionBitacora(null), { anteriores: {}, nuevos: {}, calculo: null });
});
