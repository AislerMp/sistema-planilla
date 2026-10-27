import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../src/context/AuthContext.jsx";
import GestionarAsistencias from "../src/pages/marcas&Asistencias/gestionarAsistencias.jsx";
import TablaAsistencias from "../src/components/TablaAsistencias.jsx";
import EditarHorasModal from "../src/components/EditarHorasModal.jsx";
import { getAsistenciasPorRestaurante } from "../src/services/asistenciasDiarias.Service.js";
import "../src/index.css";

// Página de prueba aislada: todas las peticiones de negocio se interceptan.
// Abrir /test/asistencias.interfaz.html con Vite y VITE_API_URL configurado.

window.IS_REACT_ACT_ENVIRONMENT = true;
let filas, peticiones, selecciones, escenarioPagina = null, rechazarGuardado = false, numero = 0;
const personal = [
  { ColaboradorId: 2018, Nombres: "Ana", Apellidos: "Prueba", FechaIngreso: "2020-01-01", FechaSalida: null, NombreRestaurante: "Restaurante de prueba" },
  { ColaboradorId: 22, Nombres: "Luis", Apellidos: "Prueba", FechaIngreso: "2020-01-01", FechaSalida: null, NombreRestaurante: "Restaurante de prueba" },
];
const resultados = [];
const root = createRoot(document.getElementById("root"));
const comprobar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje); };
const fixture = (tipo, limite, otros = {}) => ({
  AsistenciaId: 1, ColaboradorId: 2018, FechaAsignada: "2026-10-26T00:00:00.000Z",
  Nombres: "Colaborador", Apellidos: "Prueba", Identificacion: "PRUEBA",
  TipoJornada: tipo, LimiteOrdinarioMinutos: limite,
  MinutosEfectivos: limite || 480, MinutosExtras: 60,
  EstadoPeriodo: "ABIERTO", FechaLimiteAjustes: "2099-12-31T00:00:00.000Z", ...otros,
});
window.fetch = async (url, opciones = {}) => {
  const body = opciones.body ? JSON.parse(opciones.body) : null;
  peticiones.push({ url: String(url), metodo: opciones.method, body });
  if (escenarioPagina) {
    const ruta = new URL(url).pathname.replace(/\/$/, "");
    let datos;
    if (ruta.endsWith("/auth/me")) datos = { user: { UsuarioId: 7, ColaboradorId: 2018, Rol: escenarioPagina } };
    else if (ruta.endsWith("/periodos-planilla")) datos = [{ PeriodoId: 22, FechaInicio: "2026-10-12T00:00:00Z", FechaFin: "2026-10-25T00:00:00Z", Estado: "ABIERTO" }];
    else if (ruta.endsWith("/restaurantes")) datos = [{ RestauranteId: 2, Nombre: "Restaurante de prueba" }];
    else if (ruta.endsWith("/colaboradores/2018")) datos = personal[0];
    else if (ruta.endsWith("/colaboradores")) datos = personal;
    else if (ruta.includes("/AsistenciasDiarias/")) datos = [];
    else throw new Error(`Petición de página inesperada: ${url}`);
    return new Response(JSON.stringify(datos), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  comprobar(String(url).includes("/AsistenciasDiarias") || String(url).includes("/extras/asistencias"), `Petición inesperada: ${url}`);
  if (opciones.method === "PATCH") {
    if (rechazarGuardado) return new Response(JSON.stringify({ message: "Existe un permiso laboral aprobado para este día." }), { status: 409, headers: { "Content-Type": "application/json" } });
    const actual = filas[0];
    if (String(url).includes("/extras/")) actual.MinutosExtras = body.minutosAjustados;
    else {
      actual.MinutosEfectivos = Math.min(body.minutos, actual.LimiteOrdinarioMinutos);
      actual.MinutosExtras = Math.max(0, body.minutos - actual.LimiteOrdinarioMinutos);
    }
    return new Response(JSON.stringify({ asistencia: { ...actual } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(filas), { status: 200, headers: { "Content-Type": "application/json" } });
};

function App({ iniciales, editable, colaboradores }) {
  const [asistencias, setAsistencias] = useState(iniciales);
  const [seleccionada, setSeleccionada] = useState(null);
  return <main style={{ padding: 24 }}><TablaAsistencias asistencias={asistencias} colaboradores={colaboradores} desde="2026-10-26" hasta="2026-10-26"
    onSeleccionarAsistencia={editable ? (a) => { selecciones++; setSeleccionada(a); } : undefined} />
    {seleccionada && <EditarHorasModal asistencia={seleccionada} onCerrar={() => setSeleccionada(null)}
      onActualizada={async () => setAsistencias(await getAsistenciasPorRestaurante({ restauranteId: 2 }))} />}
  </main>;
}
async function montar(asistencia, editable = true, colaboradores = []) {
  filas = structuredClone(Array.isArray(asistencia) ? asistencia : [asistencia]);
  peticiones = []; selecciones = 0; rechazarGuardado = false; escenarioPagina = null;
  await act(async () => root.render(<App key={++numero} iniciales={structuredClone(filas)} editable={editable} colaboradores={colaboradores} />));
}

function PaginaConSesion() {
  const { user } = useAuth();
  return user ? <GestionarAsistencias /> : null;
}

async function esperarPeticiones() {
  await act(async () => { await new Promise((resolver) => setTimeout(resolver, 60)); });
}
async function clic(elemento) { comprobar(elemento, "Falta el elemento para hacer clic"); await act(async () => elemento.click()); }
async function cambiar(selector, valor) {
  const elemento = document.querySelector(selector);
  comprobar(elemento, `Falta el campo ${selector}`);
  await act(async () => {
    if (elemento.tagName === "SELECT") {
      elemento.value = valor;
      elemento.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(elemento, String(valor));
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}
async function editar() { await clic(document.querySelector('button[aria-label^="Ver asistencia"]')); }
async function guardar() {
  await act(async () => {
    document.querySelector("dialog form").requestSubmit();
    await new Promise((resolver) => setTimeout(resolver, 30));
  });
}
async function caso(nombre, funcion) { await funcion(); resultados.push(nombre); }

try {
  for (const [tipo, limite] of [["DIURNA", 480], ["MIXTA", 420], ["NOCTURNA", 360], [null, 480]]) {
    await caso(`600 minutos y recarga ${tipo}`, async () => {
      await montar(fixture(tipo, limite)); await editar();
      await cambiar("#total-horas", 10); await cambiar("#total-minutos", 0);
      const vista = document.querySelector(".editar-horas-vista-previa").textContent;
      comprobar(vista.includes(`${limite / 60} h 0 min ordinarias`), `Vista incorrecta: ${vista}`);
      comprobar(vista.includes(`${(600 - limite) / 60} h 0 min extras`), `Extras incorrectas: ${vista}`);
      await guardar();
      comprobar(peticiones.filter((p) => p.metodo === "PATCH").length === 1, "Debe hacer un solo PATCH");
      comprobar(peticiones[0].body.minutos === 600, "Debe enviar 600, sin recortar ni duplicar extras");
      comprobar(!peticiones[0].url.includes("/extras/"), "El total debe ir al endpoint de asistencia");
      comprobar(peticiones.some((p) => p.metodo === "GET"), "Falta recargar datos del backend");
      comprobar(!document.querySelector("dialog"), "El editor debe cerrar después de recargar");
      const celda = document.querySelector("tbody td").textContent;
      comprobar(celda.includes(`${limite / 60}:00`), "La tabla debe mostrar ordinarias guardadas");
      comprobar(celda.includes(`Extras: ${(600 - limite) / 60}:00`), "La tabla debe mostrar extras guardadas");
      await editar();
      comprobar(document.querySelector("#total-horas").value === "10", "Reabrir debe reconstruir 10 horas una sola vez");
    });
    for (const total of [0, limite]) {
      await caso(`total ${total}, jornada ${tipo}`, async () => {
        await montar(fixture(tipo, limite)); await editar();
        await cambiar("#total-horas", total / 60); await cambiar("#total-minutos", 0);
        comprobar(document.querySelector(".editar-horas-vista-previa").textContent.includes("0 h 0 min extras"), "No debe prever extras");
        await guardar(); comprobar(peticiones[0].body.minutos === total, "Total enviado incorrecto");
        comprobar(filas[0].MinutosExtras === 0, "Se deben guardar cero extras");
      });
    }
  }
  await caso("edición independiente de extras", async () => {
    await montar(fixture("MIXTA", 420)); await editar();
    await cambiar("#tipo-ajuste", "extras"); await cambiar("#extras-horas", 1); await cambiar("#extras-minutos", 30);
    await guardar();
    comprobar(peticiones[0].url.includes("/extras/asistencias/1/minutos"), "Endpoint de extras incorrecto");
    comprobar(peticiones[0].body.minutosAjustados === 90 && !("minutos" in peticiones[0].body), "Debe enviar solo el ajuste de extras");
    comprobar(filas[0].MinutosEfectivos === 420, "Debe conservar las ordinarias");
  });
  await caso("límite ausente bloquea la distribución sin inventar ocho horas", async () => {
    await montar(fixture(null, null)); await editar(); await cambiar("#total-horas", 10); await guardar();
    comprobar(document.querySelector("dialog").textContent.includes("No se recibió un límite ordinario válido"), "Falta el mensaje de límite");
    comprobar(peticiones.length === 0, "No debe guardar con límite ausente");
  });
  await caso("etiqueta abre el diálogo sin editar, cierra por cancelar y devuelve foco", async () => {
    await montar(fixture("MIXTA", 420));
    const boton = document.querySelector(".jornada-etiqueta"); boton.focus(); await clic(boton);
    comprobar(selecciones === 0 && peticiones.length === 0, "Abrir jornada no debe editar ni consultar");
    comprobar(document.querySelector("dialog").textContent.includes("7 h 0 min"), "Falta el límite en el detalle");
    comprobar(document.querySelector("dialog").contains(document.activeElement), "El foco debe estar dentro del diálogo");
    await act(async () => document.querySelector("dialog").dispatchEvent(new Event("cancel", { cancelable: true })));
    comprobar(!document.querySelector("dialog"), "Cancelar debe cerrar el detalle");
    comprobar(document.activeElement === boton, "El foco debe volver a la etiqueta");
    await clic(boton); await clic(document.querySelector('dialog button[aria-label="Cerrar"]'));
    comprobar(!document.querySelector("dialog"), "El botón debe cerrar el detalle");
  });
  for (const EstadoPeriodo of ["PROGRAMADO", "CERRADO", "PAGADO"]) {
    await caso(`período ${EstadoPeriodo} bloquea edición, no información`, async () => {
      await montar(fixture("NOCTURNA", 360, { EstadoPeriodo }));
      comprobar(document.querySelector('button[aria-label^="Ver asistencia"]').disabled, "Debe bloquear la edición");
      await clic(document.querySelector(".jornada-etiqueta")); comprobar(document.querySelector("dialog"), "Debe poder consultar jornada");
    });
  }
  await caso("plazo vencido y rol de consulta", async () => {
    await montar(fixture(null, 480, { FechaLimiteAjustes: "2000-01-01" }));
    comprobar(document.querySelector('button[aria-label^="Ver asistencia"]').disabled, "Debe bloquear por plazo");
    await montar(fixture(null, 480), false);
    comprobar(!document.querySelector('button[aria-label^="Ver asistencia"]'), "El rol de consulta no debe tener botón de editar");
    comprobar(document.querySelector(".jornada-etiqueta").textContent === "Sin clasificar", "No debe inventar jornada");
  });
  await caso("el rechazo del servidor conserva el editor y los valores guardados", async () => {
    await montar(fixture("MIXTA", 420)); await editar(); await cambiar("#total-horas", 10);
    rechazarGuardado = true; await guardar();
    comprobar(document.querySelector("dialog").textContent.includes("permiso laboral aprobado"), "Debe mostrar la restricción del servidor");
    comprobar(filas[0].MinutosEfectivos === 420 && filas[0].MinutosExtras === 60, "No debe asumir el reparto local como guardado");
    comprobar(!peticiones.some((p) => p.metodo === "GET"), "Un fallo no debe cerrar ni recargar como si se guardara");
  });
  await caso("las cuatro etiquetas tienen texto y colores distintos en ambos temas", async () => {
    for (const tema of ["light", "dark"]) {
      document.documentElement.dataset.theme = tema;
      const colores = new Set();
      for (const [tipo, limite, nombre] of [["DIURNA", 480, "Diurna"], ["MIXTA", 420, "Mixta"], ["NOCTURNA", 360, "Nocturna"], [null, 480, "Sin clasificar"]]) {
        await montar(fixture(tipo, limite));
        const etiqueta = document.querySelector(".jornada-etiqueta");
        comprobar(etiqueta.textContent === nombre, "Falta el texto de la jornada");
        colores.add(getComputedStyle(etiqueta).color);
      }
      comprobar(colores.size === 4, `Los colores deben distinguirse en tema ${tema}`);
    }
  });
  await caso("todos los colaboradores aparecen aunque nadie tenga asistencias", async () => {
    await montar([], true, personal);
    const filasTabla = document.querySelectorAll("tbody tr");
    comprobar(filasTabla.length === 2, "Deben aparecer ambos colaboradores");
    comprobar([...filasTabla].every((fila) => fila.textContent.includes("Total: 0:00")), "Los totales deben ser cero");
    comprobar(!document.querySelector('button[aria-label^="Ver asistencia"]'), "No debe permitir editar asistencias inexistentes");
    comprobar(!document.querySelector(".jornada-etiqueta"), "No debe inventar una jornada");
  });
  await caso("mezcla colaboradores con y sin registros sin duplicar ni perder asistencias", async () => {
    await montar(fixture("MIXTA", 420), true, personal);
    comprobar(document.querySelectorAll("tbody tr").length === 2, "No debe duplicar al colaborador con asistencia");
    comprobar(document.querySelectorAll('button[aria-label^="Ver asistencia"]').length === 1, "Solo la asistencia real debe ser editable");
    comprobar(document.querySelector("tbody").textContent.includes("Total: 7:00"), "Debe conservar el total registrado");
    comprobar(document.querySelectorAll('span[aria-label="Sin registro"]').length === 1, "Debe mostrar el día sin registro");
    await montar(fixture("MIXTA", 420), true, [personal[1]]);
    comprobar(document.querySelectorAll("tbody tr").length === 2, "Debe conservar registros de quien ya no figura en el restaurante actual");
  });
  await caso("los períodos anteriores incluyen exempleados y excluyen ingresos posteriores", async () => {
    await montar([], true, [
      personal[0],
      { ...personal[1], Activo: false, FechaSalida: "2026-10-26" },
      { ColaboradorId: 99, FechaIngreso: "2027-01-01", Nombres: "Ingreso posterior" },
      { ColaboradorId: 98, FechaIngreso: "2020-01-01", FechaSalida: "2025-01-01", Nombres: "Salida anterior" },
    ]);
    comprobar(document.querySelectorAll("tbody tr").length === 2, "Debe respetar el vínculo laboral en el rango");
    comprobar(document.querySelector("tbody").textContent.includes("Luis Prueba"), "El estado inactivo no debe ocultar su período trabajado");
  });
  for (const rol of ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR", "COLABORADOR"]) {
    await caso(`página completa ${rol}: período sin registros conserva colaboradores y fechas`, async () => {
      escenarioPagina = rol; peticiones = [];
      await act(async () => root.render(<MemoryRouter key={++numero}><AuthProvider><PaginaConSesion /></AuthProvider></MemoryRouter>));
      await esperarPeticiones();
      await cambiar("#consultar", "Planillas");
      if (rol === "ADMINISTRADOR" || rol === "RECURSOS_HUMANOS") await cambiar("#restauranteId", "2");
      await cambiar("#periodoId", "22");
      await act(async () => document.querySelector('form[aria-labelledby="marks-filters-title"]').requestSubmit());
      await esperarPeticiones();
      comprobar(document.querySelectorAll("tbody tr").length === (rol === "COLABORADOR" ? 1 : 2), "Faltan colaboradores en un período vacío");
      comprobar(document.querySelectorAll("thead th").length === 16, "Debe mostrar los 14 días del período, aunque no haya marcas");
      comprobar(document.querySelector("thead").textContent.includes("12 oct") && document.querySelector("thead").textContent.includes("25 oct"), "El rango debe corresponder al período consultado");
      comprobar(!document.querySelector('button[aria-label^="Ver asistencia"]'), "No debe inventar registros editables");
      const consultasPersonal = peticiones.filter((p) => p.url.includes("/colaboradores"));
      if (rol === "COLABORADOR") comprobar(consultasPersonal.every((p) => p.url.endsWith("/2018")), "El colaborador solo consulta sus propios datos");
      if (rol === "ADMINISTRADOR" || rol === "RECURSOS_HUMANOS") comprobar(consultasPersonal.every((p) => p.url.includes("restauranteId=2")), "Debe aplicar el restaurante seleccionado");
      escenarioPagina = null;
    });
  }
  await act(async () => root.unmount());
  document.getElementById("resultado").textContent = "APROBADAS " + resultados.length + "\n" + resultados.join("\n");
} catch (error) {
  document.getElementById("resultado").textContent = "FALLO: " + error.stack + "\nAprobadas antes del fallo: " + resultados.join("\n");
}
