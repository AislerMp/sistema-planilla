import { beforeEach, expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule } from "node:vm";

const apiUrl = "http://localhost:4000/api";
const fetchMock = jest.fn();
const serviceSource = await readFile(
  new URL("../../src/services/liquidaciones.Service.js", import.meta.url), "utf8",
);
const helperSource = await readFile(
  new URL("../../src/utils/helper.js", import.meta.url), "utf8",
);

// Se ejecutan el service y los helpers reales con el entorno de Vite simulado.
// Las respuestas HTTP están simuladas; no se inicia la API ni se registra nada.
async function crearService(url) {
  const context = createContext({ fetch: fetchMock, URLSearchParams });
  const options = {
    context,
    initializeImportMeta(meta) {
      meta.env = { VITE_API_URL: url };
    },
  };
  const helper = new SourceTextModule(helperSource, options);
  await helper.link(() => { throw new Error("Importación inesperada del helper"); });
  const service = new SourceTextModule(serviceSource, options);
  await service.link((specifier) => {
    if (specifier !== "../utils/helper.js") throw new Error("Importación inesperada");
    return helper;
  });
  await service.evaluate();
  return service.namespace;
}

const service = await crearService(apiUrl);
const respuestaJson = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status,
  headers: { "Content-Type": "application/json" },
});

beforeEach(() => fetchMock.mockReset());

test("lista liquidaciones con los cuatro filtros admitidos y conserva la respuesta", async () => {
  const liquidaciones = [{ LiquidacionId: 3, ColaboradorId: 7 }];
  fetchMock.mockResolvedValueOnce(respuestaJson(liquidaciones));

  await expect(service.getLiquidaciones({
    restauranteId: 2,
    desde: "2026-01-01",
    hasta: "2026-11-05",
    motivoSalida: "RENUNCIA",
  })).resolves.toEqual(liquidaciones);

  const [url, opciones] = fetchMock.mock.lastCall;
  expect(new URL(url).pathname).toBe("/api/liquidaciones");
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
    restauranteId: "2",
    desde: "2026-01-01",
    hasta: "2026-11-05",
    motivoSalida: "RENUNCIA",
  });
  expect(opciones).toEqual({ method: "GET", credentials: "include" });
});

test.each([undefined, {}, { restauranteId: "todos", desde: "", hasta: null }])(
  "consultar todos omite filtros vacíos y conserva la lista vacía: %#",
  async (filtros) => {
    fetchMock.mockResolvedValueOnce(respuestaJson([]));
    await expect(service.getLiquidaciones(filtros)).resolves.toEqual([]);
    expect(fetchMock.mock.lastCall[0]).toBe(`${apiUrl}/liquidaciones`);
  },
);

test.each([
  ["getLiquidacionById", "/7%2F%3F"],
  ["getLiquidacionByColaborador", "/colaboradores/7%2F%3F"],
])("%s consulta la ruta correcta y codifica el identificador", async (metodo, ruta) => {
  const liquidacion = { LiquidacionId: 3, ColaboradorId: 7 };
  fetchMock.mockResolvedValueOnce(respuestaJson(liquidacion));
  await expect(service[metodo]("7/?")).resolves.toEqual(liquidacion);
  expect(fetchMock).toHaveBeenCalledWith(`${apiUrl}/liquidaciones${ruta}`, {
    method: "GET", credentials: "include",
  });
});

test.each([
  ["calcularLiquidacion", "calculo", 200],
  ["confirmarLiquidacion", "confirmar", 201],
])("%s envía los datos de salida, sin importes ni actor proporcionados por el cliente", async (
  metodo, accion, status,
) => {
  const datosSalida = {
    motivoSalida: "DESPIDO_CON_RESPONSABILIDAD",
    fechaSalida: "2026-11-05",
    diasPreavisoTrabajados: 0,
    observacion: "Salida acordada.",
  };
  const salida = accion === "calculo"
    ? { colaboradorId: 7, totalLiquidacion: 450000 }
    : { message: "Liquidación registrada correctamente.", liquidacion: { LiquidacionId: 3 } };
  fetchMock.mockResolvedValueOnce(respuestaJson(salida, status));

  await expect(service[metodo](7, {
    ...datosSalida,
    montoCesantia: 999999,
    totalLiquidacion: 999999,
    registradoPorUsuarioId: 99,
    restauranteId: 99,
  })).resolves.toEqual(salida);

  const [url, opciones] = fetchMock.mock.lastCall;
  expect(url).toBe(`${apiUrl}/liquidaciones/colaboradores/7/${accion}`);
  expect(opciones.method).toBe("POST");
  expect(opciones.credentials).toBe("include");
  expect(opciones.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(opciones.body)).toEqual(datosSalida);
});

test("los datos opcionales ausentes no se envían como undefined o null", async () => {
  fetchMock.mockResolvedValueOnce(respuestaJson({}));
  await service.calcularLiquidacion(7, {
    motivoSalida: "RENUNCIA", fechaSalida: "2026-11-05",
  });
  expect(JSON.parse(fetchMock.mock.lastCall[1].body)).toEqual({
    motivoSalida: "RENUNCIA", fechaSalida: "2026-11-05",
  });
});

test.each([400, 401, 403, 404, 409, 500])("propaga el mensaje del backend ante HTTP %s", async (status) => {
  fetchMock.mockResolvedValueOnce(respuestaJson({ message: "Error comunicado por la API." }, status));
  await expect(service.confirmarLiquidacion(7, {})).rejects.toThrow("Error comunicado por la API.");
});

test("conserva el mensaje de un error HTTP que no es JSON", async () => {
  fetchMock.mockResolvedValueOnce(new Response("Servicio no disponible", { status: 503 }));
  await expect(service.getLiquidaciones()).rejects.toThrow("Servicio no disponible");
});

test("no envía peticiones si falta VITE_API_URL", async () => {
  const sinConfiguracion = await crearService(undefined);
  for (const consultar of [
    () => sinConfiguracion.getLiquidaciones(),
    () => sinConfiguracion.getLiquidacionById(3),
    () => sinConfiguracion.getLiquidacionByColaborador(7),
    () => sinConfiguracion.calcularLiquidacion(7, {}),
    () => sinConfiguracion.confirmarLiquidacion(7, {}),
  ]) {
    await expect(consultar()).rejects.toThrow("Falta configurar VITE_API_URL");
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("propaga los errores de conexión", async () => {
  const error = new TypeError("Failed to fetch");
  fetchMock.mockRejectedValueOnce(error);
  await expect(service.calcularLiquidacion(7, {})).rejects.toBe(error);
});
