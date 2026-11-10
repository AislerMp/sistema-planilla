import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

// Se ejecuta el componente con estado y efectos simulados, sin navegador ni API real.
const archivo = new URL("../../src/components/layout/CampanaNotificaciones.jsx", import.meta.url);
const { code } = await transformWithOxc(await readFile(archivo, "utf8"), archivo.pathname, {
  jsx: { runtime: "automatic" },
});
const avisos = ["VACACIONES", "INCAPACIDAD", "DEDUCCION", "PERMISO_LABORAL", "HORAS_EXTRAS"].map((tipo, i) => ({
  NotificacionId: `aviso-${i}`, SolicitudId: 31 + i, TipoSolicitud: tipo,
  Estado: "APROBADA", NotificacionFechaCreacion: "2026-11-08T16:30:00.000Z",
}));
const jsx = (type, props = {}) => ({ type, props });
const nodos = (node) => Array.isArray(node) ? node.flatMap(nodos)
  : !node || typeof node !== "object" ? [] : [node, ...nodos(node.props?.children)];
const conClase = (arbol, clase) => nodos(arbol).filter((n) => n.props.className?.split(" ").includes(clase));
const boton = (arbol) => conClase(arbol, "notificaciones-boton")[0];
const contador = (arbol) => conClase(arbol, "notificaciones-contador")[0]?.props.children;
const enlaces = (arbol) => nodos(arbol).filter((n) => n.type === "Link");
let Campana, usuario, storage, localStorage, consultar, hooks, efectos, pendientes, cursor, intervalos, listeners;

function render() {
  cursor = 0;
  const arbol = Campana();
  for (const ejecutar of pendientes.splice(0)) ejecutar();
  return arbol;
}
function desmontar() {
  for (const efecto of efectos) efecto?.limpiar?.();
  hooks = []; efectos = []; pendientes = [];
}
async function cargar() {
  render();
  await new Promise(setImmediate);
  return render();
}
function abrir() {
  let arbol = render();
  if (!boton(arbol).props["aria-expanded"]) {
    boton(arbol).props.onClick();
    arbol = render();
  }
  return arbol;
}

beforeEach(async () => {
  usuario = { UsuarioId: 7, Rol: "COLABORADOR" };
  storage = new Map(); hooks = []; efectos = []; pendientes = []; intervalos = new Map(); listeners = new Map();
  localStorage = {
    getItem: jest.fn((clave) => storage.get(clave) ?? null),
    setItem: jest.fn((clave, valor) => storage.set(clave, valor)),
  };
  consultar = jest.fn().mockResolvedValue(avisos);
  const context = vm.createContext({
    AbortController,
    window: {
      localStorage,
      setInterval: (fn) => { const id = intervalos.size + 1; intervalos.set(id, fn); return id; },
      clearInterval: (id) => intervalos.delete(id),
    },
    document: {
      addEventListener: (nombre, fn) => listeners.set(nombre, fn),
      removeEventListener: (nombre, fn) => { if (listeners.get(nombre) === fn) listeners.delete(nombre); },
    },
  });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(fn, deps) {
      const i = cursor++, anterior = efectos[i];
      if (!anterior || deps.some((dep, j) => !Object.is(dep, anterior.deps[j]))) {
        pendientes.push(() => {
          anterior?.limpiar?.();
          efectos[i] = { deps, limpiar: fn() };
        });
      }
    },
  };
  const modulo = new vm.SourceTextModule(code, { context });
  await modulo.link((ruta) => {
    let exports;
    if (ruta === "react") exports = react;
    else if (ruta === "react/jsx-runtime") exports = { jsx, jsxs: jsx };
    else if (ruta === "react-router-dom") exports = { Link: "Link" };
    else if (ruta === "lucide-react") exports = Object.fromEntries(["Bell", "BellOff", "CalendarDays", "Check", "ChevronRight", "CircleAlert", "ClipboardCheck", "Clock3", "HeartPulse", "ReceiptText", "X"].map((name) => [name, name]));
    else if (ruta.endsWith("AuthContext.jsx")) exports = { useAuth: () => ({ user: usuario }) };
    else if (ruta.endsWith("notificaciones.Service.js")) exports = { getNotificaciones: consultar };
    else if (ruta.endsWith("loadingState.jsx")) exports = { default: "LoadingState" };
    else throw new Error(`Dependencia inesperada: ${ruta}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [nombre, valor] of Object.entries(exports)) this.setExport(nombre, valor);
    }, { context });
  });
  await modulo.evaluate();
  Campana = modulo.namespace.default;
});
afterEach(() => desmontar());

test("abrir el panel conserva los avisos sin leer; tocar uno reduce el contador y navega", async () => {
  await cargar();
  let arbol = abrir();
  expect(contador(arbol)).toBe(5);
  const link = enlaces(arbol).find((n) => n.props.to === "/vacaciones/31");
  link.props.onClick();
  arbol = render();
  expect(contador(arbol)).toBe(4);
  expect(boton(arbol).props["aria-expanded"]).toBe(false);
  expect(boton(arbol).props["aria-label"]).toContain("4 avisos sin leer");
  arbol = abrir();
  expect(enlaces(arbol)).toHaveLength(5);
  expect(conClase(arbol, "notificacion-enlace--leida")).toHaveLength(1);
  expect(conClase(arbol, "notificacion-lectura")[0].props.children).toContain("Leída");
});

test("volver a tocar un aviso leído no descuenta otro ni lo guarda dos veces", async () => {
  await cargar();
  enlaces(abrir())[0].props.onClick();
  enlaces(abrir())[0].props.onClick();
  expect(contador(render())).toBe(4);
  expect(localStorage.setItem).toHaveBeenCalledTimes(1);
});

test("al leer todos desaparece el número y los avisos siguen visibles como leídos", async () => {
  await cargar();
  for (let i = 0; i < avisos.length; i++) enlaces(abrir())[i].props.onClick();
  expect(contador(render())).toBeUndefined();
  expect(boton(render()).props["aria-label"]).toContain("0 avisos sin leer");
  const arbol = abrir();
  expect(enlaces(arbol)).toHaveLength(5);
  expect(conClase(arbol, "notificacion-enlace--leida")).toHaveLength(5);
});

test("la lectura se conserva al recargar y queda separada por usuario", async () => {
  await cargar();
  enlaces(abrir())[0].props.onClick();
  desmontar();
  expect(contador(await cargar())).toBe(4);
  desmontar();
  usuario = { UsuarioId: 8, Rol: "COLABORADOR" };
  expect(contador(await cargar())).toBe(5);
  desmontar();
  usuario = { UsuarioId: 7, Rol: "COLABORADOR" };
  expect(contador(await cargar())).toBe(4);
});

test("actualizar avisos no vuelve a contar los leídos, pero un evento nuevo de la misma solicitud sí cuenta", async () => {
  await cargar();
  for (let i = 0; i < avisos.length; i++) enlaces(abrir())[i].props.onClick();
  await [...intervalos.values()][0]();
  expect(contador(render())).toBeUndefined();
  consultar.mockResolvedValueOnce([...avisos, { ...avisos[0], NotificacionId: "evento-nuevo", Estado: "RECHAZADA" }]);
  await [...intervalos.values()][0]();
  expect(contador(render())).toBe(1);
});

test.each(["JSON inválido", "{}"])("el almacenamiento inválido no impide abrir las notificaciones: %s", async (valor) => {
  storage.set("notificaciones-leidas:7", valor);
  expect(contador(await cargar())).toBe(5);
});

test("si el navegador bloquea el almacenamiento, leer y navegar siguen funcionando", async () => {
  localStorage.getItem.mockImplementation(() => { throw new Error("Bloqueado"); });
  localStorage.setItem.mockImplementation(() => { throw new Error("Bloqueado"); });
  await cargar();
  expect(() => enlaces(abrir())[0].props.onClick()).not.toThrow();
  expect(contador(render())).toBe(4);
  expect(boton(render()).props["aria-expanded"]).toBe(false);
});

test("se conservan los enlaces de detalle y los apartados que no tienen una página individual", async () => {
  await cargar();
  expect(enlaces(abrir()).map((n) => n.props.to)).toEqual([
    "/solicitudes-horas-extras", "/permisos-laborales", "/solicitudes-deducciones/33", "/incapacidades/32", "/vacaciones/31",
  ]);
});

test("sin avisos no aparece contador", async () => {
  consultar.mockResolvedValueOnce([]);
  const arbol = await cargar();
  expect(contador(arbol)).toBeUndefined();
  expect(conClase(abrir(), "notificaciones-vacio")).toHaveLength(1);
});

test("desmontar cancela la consulta y el intervalo de actualización", async () => {
  await cargar();
  const signal = consultar.mock.calls[0][0];
  desmontar();
  expect(signal.aborted).toBe(true);
  expect(intervalos.size).toBe(0);
});
