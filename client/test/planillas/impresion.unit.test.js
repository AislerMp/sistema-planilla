import { beforeEach, expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

// Se ejecuta la página con respuestas de API simuladas, sin navegador ni base de datos.
const archivo = new URL("../../src/pages/planillas/pages/PlanillasPagadasPage.jsx", import.meta.url);
const { code } = await transformWithOxc(await readFile(archivo, "utf8"), archivo.pathname, {
  jsx: { runtime: "automatic" },
});
const archivoDetalle = new URL("../../src/pages/planillas/pages/DetallePagoPage.jsx", import.meta.url);
const { code: codeDetalle } = await transformWithOxc(await readFile(archivoDetalle, "utf8"), archivoDetalle.pathname, {
  jsx: { runtime: "automatic" },
});
const periodo = { PeriodoId: 7, Estado: "PAGADO", FechaInicio: "2026-10-01", FechaFin: "2026-10-14", FechaPago: "2026-10-15" };
const ana = { DetallePlanillaId: 41, ColaboradorId: 101, ColaboradorNombre: "Ana", ColaboradorApellido1: "Pérez", ColaboradorApellido2: null, RestauranteId: 1, RestauranteNombre: "Central", TotalIngresos: 1000, TotalDeducciones: 100, TotalNeto: 900 };
const luis = { ...ana, DetallePlanillaId: 42, ColaboradorId: 102, ColaboradorNombre: "Luis", RestauranteId: 2, RestauranteNombre: "Norte", TotalIngresos: 2000, TotalDeducciones: 200, TotalNeto: 1800 };
const conceptos = [
  { TipoConcepto: "INGRESO", CodigoConcepto: "ORDINARIAS", Monto: 800 },
  { TipoConcepto: "DEDUCCION", CodigoConcepto: "CCSS", Monto: 80 },
];
const listo = (data) => ({ data, isLoading: false, error: null });
let rol, filtros, respuestas, solicitudes, servicios, imprimir, Pagina, PaginaDetalle;

const jsx = (type, props = {}) => ({ type, props });
function nodos(node) {
  if (Array.isArray(node)) return node.flatMap(nodos);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodos(node.props?.children)];
}
const texto = (node) => Array.isArray(node) ? node.map(texto).join(" ").replace(/\s+/g, " ").trim()
  : node == null || typeof node === "boolean" ? ""
  : typeof node === "object" ? texto(node.props?.children) : String(node);
const reporte = (arbol) => nodos(arbol).find((n) => n.props.className === "planilla-impresion");
const boton = (arbol) => nodos(arbol).find((n) => n.type === "button" && texto(n).includes("Imprimir / Guardar como PDF"));

beforeEach(async () => {
  rol = "RECURSOS_HUMANOS";
  filtros = { periodoId: "7", restaurante: "todos" };
  respuestas = [listo([]), listo([periodo]), listo({ planilla: { FechaPago: "2026-10-16" }, detalles: [ana, luis] }), listo([]), listo(conceptos)];
  solicitudes = [];
  servicios = Object.fromEntries(["getPlanillaConDetalles", "getDetallesPlanillaRestaurante", "getMisDetallesPlanilla", "getPlanillas", "getConceptosPlanilla"].map((nombre) => [nombre, jest.fn().mockResolvedValue([])]));
  imprimir = jest.fn();
  const context = vm.createContext({ window: { print: imprimir }, document: { body: {} } });
  const modulo = new vm.SourceTextModule(code, { context });
  const enlazar = (specifier) => {
    let exports;
    if (specifier === "react") exports = { useState: () => [filtros, jest.fn()] };
    else if (specifier === "react/jsx-runtime") exports = { jsx, jsxs: jsx, Fragment: "Fragment" };
    else if (specifier === "react-router-dom") exports = { Link: "Link", NavLink: "NavLink", useParams: () => ({ detalleId: "41" }) };
    else if (specifier === "react-dom") exports = { createPortal: (children) => jsx("Portal", { children }) };
    else if (specifier === "lucide-react") exports = { ChevronRight: "ChevronRight", Printer: "Printer", ArrowLeft: "ArrowLeft" };
    else if (specifier.endsWith("AuthContext.jsx")) exports = { useAuth: () => ({ user: { Rol: rol } }) };
    else if (specifier.endsWith("planillas.Service.js")) exports = servicios;
    else if (specifier.endsWith("periodos.Service.js")) exports = { getPeriodos: jest.fn() };
    else if (specifier.endsWith("restaurantes.Service.js")) exports = { getRestaurantes: jest.fn() };
    else if (specifier.endsWith("fechaUtils.js")) exports = { formatDate: (fecha) => fecha?.slice(0, 10) };
    else if (specifier.endsWith("useAsyncRequest.js")) exports = { default: (fn) => { solicitudes.push(fn); return respuestas[solicitudes.length - 1]; } };
    else exports = { default: specifier.split("/").at(-1).replace(".jsx", "") };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  };
  await modulo.link(enlazar);
  await modulo.evaluate();
  Pagina = modulo.namespace.default;
  const moduloDetalle = new vm.SourceTextModule(codeDetalle, { context });
  await moduloDetalle.link(enlazar);
  await moduloDetalle.evaluate();
  PaginaDetalle = moduloDetalle.namespace.default;
});

test.each(["RECURSOS_HUMANOS", "ADMINISTRADOR"])("%s imprime el alcance general con sus importes guardados", async (perfil) => {
  rol = perfil;
  const arbol = Pagina();
  await solicitudes[2]();
  expect(servicios.getPlanillaConDetalles).toHaveBeenCalledWith(7, "todos");
  const impreso = reporte(arbol);
  expect(texto(impreso)).toContain("General · Todos los restaurantes");
  expect(nodos(impreso).find((n) => n.type === "TablaDetallesPlanilla").props.detalles).toEqual([ana, luis]);
  expect(nodos(impreso).find((n) => n.type === "ResumenPlanilla").props.resumenGeneralPlanilla)
    .toEqual({ totalIngresos: 3000, totalDeducciones: 300, totalNeto: 2700 });
  boton(arbol).props.onClick();
  expect(imprimir).toHaveBeenCalledTimes(1);
});

test("el filtro solicita el restaurante a la API y sus totales no usan la cabecera general", async () => {
  filtros.restaurante = "2";
  respuestas[2] = listo({ planilla: { TotalIngresos: 3000 }, detalles: [luis] });
  const impreso = reporte(Pagina());
  await solicitudes[2]();
  expect(servicios.getPlanillaConDetalles).toHaveBeenCalledWith(7, "2");
  expect(texto(impreso)).toContain("Norte");
  expect(texto(impreso)).not.toContain("Todos los restaurantes");
  expect(nodos(impreso).find((n) => n.type === "TablaDetallesPlanilla").props.detalles).toEqual([luis]);
  expect(nodos(impreso).find((n) => n.type === "ResumenPlanilla").props.resumenGeneralPlanilla.totalIngresos).toBe(2000);
});

test("gerente usa exclusivamente la consulta de su restaurante", async () => {
  rol = "GERENTE";
  respuestas[2] = listo([ana]);
  const impreso = reporte(Pagina());
  await solicitudes[2]();
  await solicitudes[3]();
  await solicitudes[4]();
  expect(servicios.getDetallesPlanillaRestaurante).toHaveBeenCalledWith(7);
  expect(servicios.getPlanillaConDetalles).not.toHaveBeenCalled();
  expect(servicios.getPlanillas).not.toHaveBeenCalled();
  expect(servicios.getConceptosPlanilla).not.toHaveBeenCalled();
  expect(texto(impreso)).toContain("Central");
  expect(nodos(impreso).find((n) => n.type === "TablaDetallesPlanilla").props.detalles).toEqual([ana]);
});

test("colaborador pide únicamente sus datos y los conceptos del detalle autorizado", async () => {
  rol = "COLABORADOR";
  respuestas[2] = listo(ana);
  const impreso = reporte(Pagina());
  await solicitudes[2]();
  await solicitudes[3]();
  await solicitudes[4]();
  expect(servicios.getMisDetallesPlanilla).toHaveBeenCalledWith(7);
  expect(servicios.getConceptosPlanilla).toHaveBeenCalledWith(41);
  expect(servicios.getPlanillaConDetalles).not.toHaveBeenCalled();
  expect(servicios.getDetallesPlanillaRestaurante).not.toHaveBeenCalled();
  expect(servicios.getPlanillas).not.toHaveBeenCalled();
  expect(texto(impreso)).toContain("Ana Pérez");
  expect(texto(impreso)).toContain("Central");
  expect(texto(impreso)).toContain("2026-10-01 – 2026-10-14");
  expect(nodos(impreso).find((n) => n.type === "TablaConceptosPlanilla").props.conceptos).toEqual(conceptos);
  // Los conceptos de la muestra difieren: el resumen usa el importe persistido del detalle.
  expect(nodos(impreso).find((n) => n.type === "ResumenPlanilla").props.resumenGeneralPlanilla.totalNeto).toBe(900);
});

test("no vuelve a pedir conceptos que ya están cargados", async () => {
  rol = "COLABORADOR";
  respuestas[2] = listo({ ...ana, conceptos });
  Pagina();
  expect(await solicitudes[4]()).toEqual(conceptos);
  expect(servicios.getConceptosPlanilla).not.toHaveBeenCalled();
});

test("imprime solo la fecha registrada y omite la programada si no hay fecha real", () => {
  let impreso = reporte(Pagina());
  expect(texto(impreso)).toContain("2026-10-16");
  expect(texto(impreso)).not.toContain("2026-10-15");
  solicitudes = [];
  respuestas[2] = listo({ planilla: {}, detalles: [ana] });
  impreso = reporte(Pagina());
  expect(texto(impreso)).not.toContain("Fecha de pago");
});

test.each(["sin selección", "cerrado", "vacío", "cargando", "error", "filtros cargando", "error de filtros"])("no ofrece impresión: %s", (caso) => {
  if (caso === "sin selección") filtros.periodoId = null;
  if (caso === "cerrado") respuestas[1] = listo([{ ...periodo, Estado: "CERRADO" }]);
  if (caso === "vacío") respuestas[2] = listo({ planilla: {}, detalles: [] });
  if (caso === "cargando") respuestas[2].isLoading = true;
  if (caso === "error") respuestas[2].error = "Fallo de consulta";
  if (caso === "filtros cargando") respuestas[1].isLoading = true;
  if (caso === "error de filtros") respuestas[0].error = "Fallo de filtros";
  const arbol = Pagina();
  expect(boton(arbol)).toBeUndefined();
  expect(reporte(arbol)).toBeUndefined();
});

test.each(["vacíos", "cargando", "error"])("colaborador no imprime conceptos %s", (caso) => {
  rol = "COLABORADOR";
  respuestas[2] = listo(ana);
  if (caso === "vacíos") respuestas[4] = listo([]);
  if (caso === "cargando") respuestas[4].isLoading = true;
  if (caso === "error") respuestas[4].error = "Fallo de conceptos";
  const arbol = Pagina();
  expect(boton(arbol)).toBeUndefined();
  expect(reporte(arbol)).toBeUndefined();
});

test.each([["GERENTE", []], ["COLABORADOR", null]])("%s no imprime un período sin pagos propios", async (perfil, datos) => {
  rol = perfil;
  respuestas[2] = listo(datos);
  const arbol = Pagina();
  expect(boton(arbol)).toBeUndefined();
  expect(reporte(arbol)).toBeUndefined();
  expect(await solicitudes[4]()).toEqual([]);
  expect(servicios.getConceptosPlanilla).not.toHaveBeenCalled();
});

const conceptosDelDetalle = conceptos.map((concepto) => ({
  ...ana, ...concepto, PeriodoId: 7, EstadoPeriodo: "PAGADO",
  FechaInicio: "2026-10-01", FechaFin: "2026-10-14", FechaPago: "2026-10-16",
}));

test("el detalle abierto directamente imprime el comprobante obtenido por su ID autorizado", async () => {
  respuestas = [listo(conceptosDelDetalle)];
  const arbol = PaginaDetalle();
  await solicitudes[0]();
  expect(servicios.getConceptosPlanilla).toHaveBeenCalledWith("41");
  expect(servicios.getPlanillaConDetalles).not.toHaveBeenCalled();
  const impreso = reporte(arbol);
  expect(texto(impreso)).toContain("Ana Pérez");
  expect(texto(impreso)).toContain("Central");
  expect(texto(impreso)).toContain("2026-10-01 – 2026-10-14");
  expect(texto(impreso)).toContain("2026-10-16");
  expect(nodos(impreso).find((n) => n.type === "TablaConceptosPlanilla").props.conceptos).toEqual(conceptosDelDetalle);
  expect(nodos(impreso).find((n) => n.type === "ResumenPlanilla").props.resumenGeneralPlanilla)
    .toEqual({ totalIngresos: 1000, totalDeducciones: 100, totalNeto: 900 });
  boton(arbol).props.onClick();
  expect(imprimir).toHaveBeenCalledTimes(1);
});

test.each(["cargando", "sin permiso", "vacío", "cerrado"])("el detalle no permite imprimir: %s", (caso) => {
  respuestas = [listo(conceptosDelDetalle)];
  if (caso === "cargando") respuestas[0].isLoading = true;
  if (caso === "sin permiso") respuestas[0].error = "Solo podés consultar planillas de tu restaurante asignado.";
  if (caso === "vacío") respuestas[0].data = [];
  if (caso === "cerrado") respuestas[0].data = conceptosDelDetalle.map((c) => ({ ...c, EstadoPeriodo: "CERRADO" }));
  const arbol = PaginaDetalle();
  expect(boton(arbol)).toBeUndefined();
  expect(reporte(arbol)).toBeUndefined();
});

test.each([
  ["Pérez", null, "Ana Pérez"],
  ["Pérez", "Mora", "Ana Pérez Mora"],
  ["de la Cruz", "Del Valle", "Ana de la Cruz Del Valle"],
  ["Pérez Mora", null, "Ana Pérez Mora"],
])("los comprobantes muestran ambos apellidos sin valores vacíos: %s / %s", (ColaboradorApellido1, ColaboradorApellido2, esperado) => {
  const persona = { ...ana, ColaboradorApellido1, ColaboradorApellido2 };
  rol = "COLABORADOR";
  respuestas[2] = listo(persona);
  expect(texto(reporte(Pagina()))).toContain(esperado);
  solicitudes = [];
  respuestas = [listo(conceptosDelDetalle.map((concepto) => ({ ...concepto, ...persona })))];
  const impreso = texto(reporte(PaginaDetalle()));
  expect(impreso).toContain(esperado);
  expect(impreso).not.toMatch(/null|undefined/);
});
