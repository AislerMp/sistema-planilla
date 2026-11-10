import { expect, test } from "@jest/globals";
import { adaptarColaboradorLiquidacion } from "../../src/utils/liquidacionesUtils.js";

const colaboradorApi = {
  ColaboradorId: 2018,
  Nombres: "Ana",
  Apellido1: "Pérez",
  Apellido2: null,
  Identificacion: "123456789",
  NombreRestaurante: "KFC HERRADURA",
  RestauranteId: 2,
  NombrePuesto: "Entrenadora",
  TarifaHora: 1900,
  FechaIngreso: "2024-12-11T00:00:00.000Z",
  Activo: true,
};

test("adapta los campos reales de colaboradores para la tabla, ficha y navegación", () => {
  expect(adaptarColaboradorLiquidacion(colaboradorApi, "2026-11-06")).toEqual({
    id: 2018,
    nombres: "Ana",
    apellidos: "Pérez",
    identificacion: "123456789",
    restauranteId: 2,
    restaurante: "KFC HERRADURA",
    puesto: "Entrenadora",
    fechaIngreso: "2024-12-11T00:00:00.000Z",
    antiguedad: "1 año y 10 meses",
    tarifaHora: 1900,
    activo: true,
    vacacionesDisponibles: null,
  });
});

test.each([
  ["2026-10-07", "Menos de un mes"],
  ["2026-10-06", "1 mes"],
  ["2025-11-06", "1 año"],
  ["2024-09-06", "2 años y 2 meses"],
  ["2027-01-01", "—"],
  [null, "—"],
])("la antigüedad visible sale de FechaIngreso: %s", (FechaIngreso, esperado) => {
  const persona = adaptarColaboradorLiquidacion({ ...colaboradorApi, FechaIngreso }, "2026-11-06");
  expect(persona.antiguedad).toBe(esperado);
});

test("admite una fecha ISO o una fecha de calendario sin alterar el día de ingreso", () => {
  const persona = adaptarColaboradorLiquidacion({ ...colaboradorApi, FechaIngreso: "2024-12-11" }, "2026-11-06");
  expect(persona.antiguedad).toBe("1 año y 10 meses");
  expect(persona.fechaIngreso).toBe("2024-12-11");
});

test.each([[true, true], [1, true], [false, false], [0, false]])(
  "interpreta el estado de SQL: %s",
  (Activo, esperado) => {
    expect(adaptarColaboradorLiquidacion({ ...colaboradorApi, Activo }, "2026-11-06").activo).toBe(esperado);
  },
);

test("conserva tarifas ausentes y saldos no consultados, sin inventar ceros", () => {
  const persona = adaptarColaboradorLiquidacion({ ...colaboradorApi, TarifaHora: null }, "2026-11-06");
  expect(persona.tarifaHora).toBeNull();
  expect(persona.vacacionesDisponibles).toBeNull();
});

test("no modifica el objeto original ni copia sus datos ajenos a la ficha", () => {
  const original = Object.freeze({ ...colaboradorApi, Correo: "ejemplo@example.invalid" });
  const persona = adaptarColaboradorLiquidacion(original, "2026-11-06");
  expect(original).toEqual({ ...colaboradorApi, Correo: "ejemplo@example.invalid" });
  expect(persona).not.toHaveProperty("Correo");
});

test.each([
  ["Pérez", null, "Pérez"],
  ["Pérez", "Mora", "Pérez Mora"],
  ["de la Cruz", "Del Valle", "de la Cruz Del Valle"],
  ["Pérez Mora", null, "Pérez Mora"],
])("la ficha une los dos apellidos y conserva los compuestos: %s / %s", (Apellido1, Apellido2, esperado) => {
  const persona = adaptarColaboradorLiquidacion({ ...colaboradorApi, Apellido1, Apellido2 });
  expect(persona.apellidos).toBe(esperado);
});
