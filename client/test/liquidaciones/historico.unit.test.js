import { expect, test } from "@jest/globals";
import { adaptarLiquidacionHistorica } from "../../src/utils/liquidacionesUtils.js";

const registro = {
  LiquidacionId: 42, ColaboradorId: 101, RestauranteId: 2,
  ColaboradorNombre: "Ana", ColaboradorApellido1: "Pérez", ColaboradorApellido2: null, Identificacion: "012345678",
  RestauranteNombre: "Restaurante central", FechaIngreso: "2024-01-01T00:00:00.000Z",
  FechaSalida: "2026-11-06T00:00:00.000Z", FechaSalidaColaborador: null,
  MotivoSalida: "RENUNCIA", RegistradoPorUsuarioId: 7, RegistradoPorNombre: "recursos.humanos",
  DiasVacacionesPagados: "3.40", DiasPreavisoPagados: 0, DiasCesantiaPagados: 0,
  MontoVacaciones: "51680.00", MontoAguinaldo: "20357.14", MontoPreaviso: 0,
  MontoCesantia: 0, TotalLiquidacion: "72037.14", DetallePlanillaId: 99, Observacion: "Salida registrada.",
};

test("adapta el contrato real del histórico y conserva la identificación con ceros", () => {
  const historica = adaptarLiquidacionHistorica(registro);
  expect(historica).toMatchObject({
    id: 42, colaboradorId: 101, nombres: "Ana", apellidos: "Pérez", identificacion: "012345678",
    restauranteId: 2, restaurante: "Restaurante central", registradoPor: "recursos.humanos",
    motivoSalida: "RENUNCIA", detallePlanillaId: 99, observacion: "Salida registrada.",
  });
  expect(historica.desglose).toEqual({
    diasVacacionesPagados: 3.4, diasPreavisoPagados: 0, diasCesantiaPagados: 0,
    montoVacaciones: 51680, montoAguinaldo: 20357.14, montoPreaviso: 0,
    montoCesantia: 0, totalLiquidacion: 72037.14,
  });
});

test("usa la fecha de la liquidación sin desplazarla ni sustituirla por la fecha del colaborador", () => {
  expect(adaptarLiquidacionHistorica({ ...registro, FechaSalidaColaborador: "2026-12-01" }).fechaSalida)
    .toBe("2026-11-06");
});

test("presenta el total persistido sin recalcularlo con datos actuales", () => {
  expect(adaptarLiquidacionHistorica({ ...registro, TotalLiquidacion: "123.45" }).desglose.totalLiquidacion)
    .toBe(123.45);
});

test("conserva importes ausentes como null y los ceros reales como cero", () => {
  expect(adaptarLiquidacionHistorica({ ...registro, TotalLiquidacion: null, MontoPreaviso: null }).desglose)
    .toMatchObject({ totalLiquidacion: null, montoPreaviso: null, montoCesantia: 0 });
});

test.each([[7, "Usuario #7"], [null, "—"]])("resuelve el autor ausente a partir del identificador: %s", (id, esperado) => {
  expect(adaptarLiquidacionHistorica({ ...registro, RegistradoPorNombre: null, RegistradoPorUsuarioId: id }).registradoPor)
    .toBe(esperado);
});

test("un registro sin vínculo no inventa una planilla ni modifica el objeto de la API", () => {
  const original = Object.freeze({ ...registro, DetallePlanillaId: null });
  expect(adaptarLiquidacionHistorica(original).detallePlanillaId).toBeNull();
  expect(original).toEqual({ ...registro, DetallePlanillaId: null });
});

test.each([[null, "de la Cruz"], ["Mora", "de la Cruz Mora"]])("el histórico respeta los alias de los apellidos: %s", (ColaboradorApellido2, esperado) => {
  expect(adaptarLiquidacionHistorica({ ...registro, ColaboradorApellido1: "de la Cruz", ColaboradorApellido2 }).apellidos).toBe(esperado);
});
