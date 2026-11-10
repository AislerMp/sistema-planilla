import { beforeEach, expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import { obtenerComparacionBitacora } from "../../src/utils/bitacoraUtils.js";

const persona = {
  ColaboradorId: 12, Nombres: "Ana", Apellido1: "de la Cruz", Apellido2: "Del Valle",
  Identificacion: "123456789", Correo: "ana@example.invalid", Activo: true,
  FechaIngreso: "2024-01-01", FechaSalida: null, RestauranteId: 1, PuestoId: 2,
  NombreRestaurante: "Central", NombrePuesto: "Cajera", DistritoId: null, DetalleDireccion: null,
};
const formulario = {
  nombre: "Ana", apellido1: "de la Cruz", apellido2: "Del Valle",
  identificacion: "123456789", correo: "ana@example.invalid", fechaIngreso: "2024-01-01",
  fechaSalida: "", restauranteId: "1", puestoId: "2",
};
const listo = (data) => ({ data, isLoading: false, error: null });
const jsx = (type, props = {}) => ({ type, props });
const nodos = (node) => Array.isArray(node) ? node.flatMap(nodos)
  : !node || typeof node !== "object" ? [] : [node, ...nodos(node.props?.children)];
const texto = (node) => Array.isArray(node) ? node.map(texto).join("")
  : node == null || typeof node === "boolean" ? ""
  : typeof node === "object" ? texto(node.props?.children) : String(node);
let respuestas, indiceConsulta, cursor, estados, efectos, form, servicios;
beforeEach(() => {
  respuestas = []; indiceConsulta = 0; cursor = 0; estados = []; efectos = [];
  form = {
    register: jest.fn((name) => ({ name })), handleSubmit: (fn) => fn,
    getValues: jest.fn(), reset: jest.fn(), formState: { errors: {}, isSubmitting: false },
  };
  servicios = { createColaborador: jest.fn(), updateColaborador: jest.fn(), getColaborador: jest.fn(), getColaboradores: jest.fn(), activateColaborador: jest.fn(), deactivateColaborador: jest.fn() };
});

async function cargarPagina(ruta) {
  const archivo = new URL(`../../src/${ruta}`, import.meta.url);
  const { code } = await transformWithOxc(await readFile(archivo, "utf8"), archivo.pathname, { jsx: { runtime: "automatic" } });
  const context = vm.createContext({ console: { ...console, log: jest.fn() }, Intl });
  const modulo = new vm.SourceTextModule(code, { context });
  await modulo.link((rutaImportada) => {
    let exports;
    if (rutaImportada === "react") exports = {
      useState(initial) {
        const i = cursor++;
        if (!(i in estados)) estados[i] = typeof initial === "function" ? initial() : initial;
        return [estados[i], (value) => { estados[i] = typeof value === "function" ? value(estados[i]) : value; }];
      },
      useEffect: (fn) => efectos.push(fn),
      useId: () => "test-id",
    };
    else if (rutaImportada === "react-hook-form") exports = { useForm: (options) => { form.defaultValues = options.defaultValues; return form; } };
    else if (rutaImportada === "react/jsx-runtime") exports = { jsx, jsxs: jsx, Fragment: "Fragment" };
    else if (rutaImportada === "react-router-dom") exports = { Link: "Link", NavLink: "NavLink", Navigate: "Navigate", useNavigate: () => jest.fn(), useParams: () => ({ colaboradorId: "12" }) };
    else if (rutaImportada === "lucide-react") exports = Object.fromEntries(["ArrowLeft", "Save", "Edit", "Power", "PowerOff", "SearchX", "ChevronRight"].map((name) => [name, name]));
    else if (rutaImportada.endsWith("AuthContext.jsx")) exports = { useAuth: () => ({ user: { Rol: "ADMINISTRADOR" } }) };
    else if (rutaImportada.endsWith("useAsyncRequest.js")) exports = { default: () => respuestas[indiceConsulta++] };
    else if (rutaImportada.endsWith("colaboradores.Service.js")) exports = servicios;
    else if (rutaImportada.endsWith("restaurantes.Service.js")) exports = { getRestaurantes: jest.fn() };
    else if (rutaImportada.endsWith("puestos.Service.js")) exports = { getPuestos: jest.fn() };
    else if (rutaImportada.endsWith("notifications.js")) exports = { notifySuccess: jest.fn() };
    else exports = { default: rutaImportada.split("/").at(-1).replace(".jsx", "") };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await modulo.evaluate();
  return modulo.namespace;
}
function render(Componente, props) {
  cursor = 0; indiceConsulta = 0; efectos = [];
  const arbol = Componente(props);
  for (const efecto of efectos) efecto();
  return arbol;
}
const catalogos = [listo([{ RestauranteId: 1, Nombre: "Central" }]), listo([{ PuestoId: 2, Nombre: "Cajera" }])];

test.each(["createColaborador", "updateColaborador"])("%s presenta y envía los dos campos de apellido", async (pagina) => {
  const { default: Componente } = await cargarPagina(`pages/colaboradores/${pagina}.jsx`);
  respuestas = pagina === "updateColaborador" ? [listo(persona), ...catalogos] : catalogos;
  const arbol = render(Componente);
  expect(form.defaultValues.apellido1).toBe("");
  expect(form.defaultValues.apellido2).toBe("");
  expect(texto(arbol)).toContain("Primer apellido");
  expect(texto(arbol)).toContain("Segundo apellido (opcional)");
  const opciones1 = form.register.mock.calls.find(([name]) => name === "apellido1")[1];
  const opciones2 = form.register.mock.calls.find(([name]) => name === "apellido2")[1];
  expect(opciones1.required).toBeTruthy();
  expect(opciones1.validate("  ")).not.toBe(true);
  expect(opciones1.validate("de la Cruz")).toBe(true);
  expect(opciones1.maxLength.value).toBe(100);
  expect(opciones2.required).toBeUndefined();
  expect(opciones2.maxLength.value).toBe(100);
  await nodos(arbol).find((n) => n.type === "form").props.onSubmit(formulario);
  const datos = pagina === "updateColaborador" ? servicios.updateColaborador.mock.calls[0][1] : servicios.createColaborador.mock.calls[0][0];
  expect(datos).toMatchObject({ apellido1: "de la Cruz", apellido2: "Del Valle" });
});

test("editar muestra el segundo apellido NULL como input vacío y permite borrarlo", async () => {
  const { default: Componente } = await cargarPagina("pages/colaboradores/updateColaborador.jsx");
  respuestas = [listo({ ...persona, Apellido2: null }), ...catalogos];
  const arbol = render(Componente);
  expect(form.reset).toHaveBeenCalledWith(expect.objectContaining({ apellido1: "de la Cruz", apellido2: "" }));
  await nodos(arbol).find((n) => n.type === "form").props.onSubmit({ ...formulario, apellido2: "" });
  expect(servicios.updateColaborador).toHaveBeenCalledWith("12", expect.objectContaining({ apellido1: "de la Cruz", apellido2: "" }));
});

test("el listado muestra ambos apellidos, genera iniciales y encuentra por el segundo", async () => {
  const { default: Componente } = await cargarPagina("pages/colaboradores/colaboradoresDashboard.jsx");
  respuestas = [listo([persona, { ...persona, ColaboradorId: 13, Nombres: "Luis", Apellido1: "Pérez", Apellido2: null }])];
  let arbol = render(Componente);
  expect(texto(arbol)).toContain("Ana de la Cruz Del Valle");
  const iniciales = nodos(arbol).find((n) => n.props.className === "avatar table-avatar");
  expect(texto(iniciales)).toBe("AD");
  nodos(arbol).find((n) => n.type === "searchBar").props.setSearch("valle");
  arbol = render(Componente);
  const tabla = nodos(arbol).find((n) => n.type === "tbody");
  expect(texto(tabla)).toContain("Ana de la Cruz Del Valle");
  expect(texto(tabla)).not.toContain("Luis");
  expect(texto(tabla)).not.toMatch(/null|undefined/);
});

test.each([null, "Del Valle"])("la tabla de planillas consume los alias de ambos apellidos: %s", async (Apellido2) => {
  const { default: Tabla } = await cargarPagina("pages/planillas/components/TablaDetallesPlanilla.jsx");
  respuestas = [listo([])];
  const arbol = render(Tabla, { detalles: [{
    DetallePlanillaId: 41, ColaboradorId: 12, ColaboradorNombre: "Ana", ColaboradorApellido1: "de la Cruz", ColaboradorApellido2: Apellido2,
    RestauranteNombre: "Central", TarifaHoraAplicada: 1900, TotalIngresos: 1000, TotalDeducciones: 100, TotalNeto: 900,
  }] });
  const esperado = Apellido2 ? "Ana de la Cruz Del Valle" : "Ana de la Cruz";
  expect(texto(arbol)).toContain(esperado);
  expect(texto(arbol)).not.toMatch(/null|undefined/);
});

test("la tabla de aguinaldos presenta ambos campos del resultado calculado", async () => {
  const { TablaAguinaldo } = await cargarPagina("pages/aguinaldos/ComponentesAguinaldo.jsx");
  const arbol = render(TablaAguinaldo, { detalles: [{ colaboradorId: 12, nombres: "Ana", apellido1: "de la Cruz", apellido2: "Del Valle", restaurante: "Central", salarioAcumulado: 1200, montoAguinaldo: 100 }] });
  expect(texto(arbol)).toContain("Ana de la Cruz Del Valle");
});

test.each([null, undefined, "", "   ", "Del Valle"])("los services envían apellido2 normalizado al crear y editar: %s", async (apellido2) => {
  const fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
  const context = vm.createContext({ fetch, URLSearchParams });
  const source = await readFile(new URL("../../src/services/colaboradores.Service.js", import.meta.url), "utf8");
  const modulo = new vm.SourceTextModule(source, { context, initializeImportMeta: (meta) => { meta.env = { VITE_API_URL: "https://api.pruebas.invalid" }; } });
  await modulo.link(() => new vm.SyntheticModule(["parseResponse"], function () { this.setExport("parseResponse", (res) => res.json()); }, { context }));
  await modulo.evaluate();
  const datos = { nombre: "Ana", apellido1: "de la Cruz", apellido2 };
  await modulo.namespace.createColaborador(datos);
  await modulo.namespace.updateColaborador(12, datos);
  for (const [, options] of fetch.mock.calls) {
    expect(JSON.parse(options.body)).toEqual({ nombre: "Ana", apellido1: "de la Cruz", apellido2: apellido2?.trim() || null });
  }
});

test("auditoría conserva los campos antiguos de los registros históricos", () => {
  const anteriores = Object.freeze({ Nombres: "Ana", Apellidos: "de la Cruz Del Valle" });
  const nuevos = Object.freeze({ nombre: "Ana", apellido1: "de la Cruz", apellido2: "Del Valle" });
  const resultado = obtenerComparacionBitacora({ Entidad: "Colaboradores", DatosAnteriores: anteriores, DatosNuevos: nuevos });
  expect(resultado.anteriores).toBe(anteriores);
  expect(resultado.anteriores.Apellidos).toBe("de la Cruz Del Valle");
  expect(resultado.nuevos).toBe(nuevos);
});
