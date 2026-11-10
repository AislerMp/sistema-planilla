import { beforeEach, expect, jest, test } from "@jest/globals";

const getLiquidacionesByRestauranteService = jest.fn();
const getLiquidacionByIdService = jest.fn();
const getLiquidacionByColaboradorService = jest.fn();
jest.unstable_mockModule("../../src/modules/liquidaciones/liquidaciones.service.js", () => ({
  getLiquidacionesByRestauranteService, getLiquidacionByIdService, getLiquidacionByColaboradorService,
}));
const { listarLiquidacionesController, obtenerLiquidacionController, obtenerLiquidacionPorColaboradorController } =
  await import("../../src/modules/liquidaciones/liquidaciones.controller.js");

const respuesta = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
beforeEach(() => jest.clearAllMocks());

test("el histórico utiliza el service existente y transmite los filtros", async () => {
  const filtros = { desde: "2026-10-01", hasta: "2026-11-06", motivoSalida: "RENUNCIA" };
  const registros = [{ LiquidacionId: 42 }];
  getLiquidacionesByRestauranteService.mockResolvedValueOnce(registros);
  const res = respuesta();
  await listarLiquidacionesController({ query: { restauranteId: "2", ...filtros } }, res);
  expect(getLiquidacionesByRestauranteService).toHaveBeenCalledWith("2", filtros);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(registros);
});

test("permite consultar todos los restaurantes y devuelve la lista vacía", async () => {
  getLiquidacionesByRestauranteService.mockResolvedValueOnce([]);
  const res = respuesta();
  await listarLiquidacionesController({ query: {} }, res);
  expect(getLiquidacionesByRestauranteService).toHaveBeenCalledWith(null, {
    desde: undefined, hasta: undefined, motivoSalida: undefined,
  });
  expect(res.json).toHaveBeenCalledWith([]);
});

test.each([
  [obtenerLiquidacionController, getLiquidacionByIdService, { liquidacionId: "42" }, "42"],
  [obtenerLiquidacionPorColaboradorController, getLiquidacionByColaboradorService, { colaboradorId: "101" }, "101"],
])("el detalle llama al service correcto con el identificador recibido: %#", async (controller, service, params, id) => {
  const registro = { LiquidacionId: 42, TotalLiquidacion: 72037.14 };
  service.mockResolvedValueOnce(registro);
  const res = respuesta();
  await controller({ params }, res);
  expect(service).toHaveBeenCalledWith(id);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(registro);
});

test("el error del detalle se propaga al manejador sin responder un éxito", async () => {
  const error = new Error("Liquidación no encontrada.");
  getLiquidacionByIdService.mockRejectedValueOnce(error);
  const res = respuesta();
  await expect(obtenerLiquidacionController({ params: { liquidacionId: "42" } }, res)).rejects.toBe(error);
  expect(res.json).not.toHaveBeenCalled();
});
