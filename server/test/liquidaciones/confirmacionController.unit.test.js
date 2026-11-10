import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const confirmarLiquidacion = jest.fn();
jest.unstable_mockModule("../../src/modules/liquidaciones/liquidaciones.service.js", () => ({
  confirmarLiquidacion,
}));
const { confirmarLiquidacionController } = await import("../../src/modules/liquidaciones/liquidaciones.controller.js");

function crearRespuesta() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => confirmarLiquidacion.mockReset());

test("confirma con el ID, los datos de salida y el actor de sesión en el orden del service", async () => {
  const req = {
    params: { colaboradorId: "2018" },
    body: { motivoSalida: "RENUNCIA", fechaSalida: "2026-11-06", diasPreavisoTrabajados: "0" },
    user: { UsuarioId: 7, Rol: "RECURSOS_HUMANOS" },
  };
  const liquidacion = { LiquidacionId: 42, ColaboradorId: 2018, TotalLiquidacion: 72037.14 };
  confirmarLiquidacion.mockResolvedValueOnce(liquidacion);
  const res = crearRespuesta();

  await confirmarLiquidacionController(req, res);

  expect(confirmarLiquidacion).toHaveBeenCalledWith("2018", req.body, req.user);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ message: "Liquidación registrada correctamente.", liquidacion });
});

test("conserva el actor de sesión cuando falta el body y deja validar los datos al service", async () => {
  const usuario = { UsuarioId: 7, Rol: "RECURSOS_HUMANOS" };
  confirmarLiquidacion.mockResolvedValueOnce({ LiquidacionId: 42 });
  await confirmarLiquidacionController({ params: { colaboradorId: "2018" }, user: usuario }, crearRespuesta());
  expect(confirmarLiquidacion).toHaveBeenCalledWith("2018", {}, usuario);
});

test("propaga los errores del registro sin responder con un éxito", async () => {
  const error = new Error("La liquidación ya existe.");
  confirmarLiquidacion.mockRejectedValueOnce(error);
  const res = crearRespuesta();
  await expect(confirmarLiquidacionController({
    params: { colaboradorId: "2018" }, body: {}, user: { UsuarioId: 7 },
  }, res)).rejects.toBe(error);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
});

afterEach(() => jest.restoreAllMocks());
