import assert from "node:assert/strict";
import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import session from "express-session";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test", SESSION_SECRET: "solo-tests",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { default: app } = await import("../src/app.js");
const { eliminarComprobante, obtenerRutaComprobante } = await import("../src/modules/incapacidades/incapacidades.upload.js");

let expected, calls, identity, server, baseUrl;
const pdf = Buffer.from("%PDF-1.4\nComprobante ficticio para pruebas\n%%EOF");
const solicitud = { SolicitudId: 31, ColaboradorId: 4, RestauranteId: 2, Estado: "PENDIENTE" };
const roles = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => {
  const parametros = {};
  return {
    input(name, _type, value) { parametros[name] = value; return this; },
    async query(query) {
      const respuesta = expected.shift();
      assert.ok(respuesta, `Consulta inesperada: ${query}`);
      assert.match(query, respuesta.pattern);
      calls.push({ query, parametros });
      if (respuesta.error) throw respuesta.error;
      return { recordset: respuesta.records ?? [], rowsAffected: [1] };
    },
  };
});
mock.method(sql.Transaction.prototype, "begin", async () => {});
mock.method(sql.Transaction.prototype, "commit", async () => {});
mock.method(sql.Transaction.prototype, "rollback", async () => {});
mock.method(sql.Transaction.prototype, "request", () => pool.request());

before(async () => {
  const harness = express();
  harness.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  harness.use((req, _res, next) => {
    if (identity) req.session.user = { Activo: true, ...identity };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/incapacidades`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  mock.restoreAll();
});
beforeEach(() => { expected = []; calls = []; identity = undefined; });
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));

function respond(pattern, records = []) { expected.push({ pattern, records }); }
async function request(method, path, body) {
  const multipart = body instanceof FormData;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: multipart ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
}
function formulario(buffer = pdf, tipo = "application/pdf", nombre = "reposo.pdf") {
  const form = new FormData();
  for (const [campo, valor] of Object.entries({
    restauranteId: "2", tipoIncapacidadId: "1", numeroDocumento: "CCSS-123",
    fechaInicio: "2026-10-06", fechaFin: "2026-10-08", motivo: "Reposo",
    colaboradorId: "999", registradoPorUsuarioId: "999",
    comprobanteRuta: "../../ajeno.pdf", comprobanteNombre: "ajeno.pdf",
  })) form.set(campo, valor);
  if (buffer) form.set("comprobante", new Blob([buffer], { type: tipo }), nombre);
  return form;
}
async function archivos() {
  try { return (await readdir(new URL("../uploads/incapacidades/", import.meta.url))).sort(); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

const rutas = [
  ["GET", "/tipos", roles],
  ["GET", "/mis-incapacidades", ["COLABORADOR"]],
  ["GET", "/restaurante", roles.slice(1)],
  ["GET", "/restaurante/2", roles.slice(1)],
  ["GET", "/31", roles],
  ["GET", "/31/comprobante", roles],
  ["GET", "/31/calculo", ["RECURSOS_HUMANOS", "ADMINISTRADOR"]],
  ["POST", "/", ["COLABORADOR"]],
  ["PATCH", "/31/revisar-gerente", ["GERENTE"]],
  ["PATCH", "/31/resolver-rh", ["RECURSOS_HUMANOS"]],
];
for (const [method, path, permitidos] of rutas) {
  test(`${method} ${path} exige sesión y los roles correspondientes`, async () => {
    assert.equal((await request(method, path)).status, 401);
    for (const Rol of [...roles.filter(rol => !permitidos.includes(rol)), "DESCONOCIDO"]) {
      identity = { UsuarioId: 7, ColaboradorId: 4, Rol };
      assert.equal((await request(method, path)).status, 403);
    }
    assert.equal(calls.length, 0);
  });
}

test("tipos y solicitudes propias usan rutas específicas y filtros normalizados", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  respond(/FROM dbo.TiposIncapacidad/, [{ TipoIncapacidadId: 1 }]);
  assert.deepEqual(await (await request("GET", "/tipos")).json(), [{ TipoIncapacidadId: 1 }]);
  respond(/FROM dbo.Incapacidades/, [solicitud]);
  const response = await request("GET", "/mis-incapacidades?colaboradorId=999&desde=2026-10-06&hasta=2026-10-08&estado=pendiente");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [solicitud]);
  assert.equal(calls.at(-1).parametros.colaboradorId, 4);
  assert.equal(calls.at(-1).parametros.estado, "PENDIENTE");
  assert.equal(calls.at(-1).parametros.desde.toISOString(), "2026-10-06T00:00:00.000Z");
  assert.equal((await request("GET", "/mis-incapacidades?hasta=2026-02-30")).status, 400);
  assert.equal((await request("GET", "/mis-incapacidades?estado=INVALIDO")).status, 400);
});

test("detalle devuelve la solicitud y respeta al propietario y restaurante", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  assert.deepEqual(await (await request("GET", "/31")).json(), solicitud);
  for (const path of ["/31", "/31/comprobante"]) {
    respond(/FROM dbo.Solicitudes AS s/, [{ ...solicitud, ColaboradorId: 99 }]);
    assert.equal((await request("GET", path)).status, 403);
  }
  identity = { UsuarioId: 7, Rol: "GERENTE" };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{ RestauranteId: 3 }]);
  assert.equal((await request("GET", "/31/comprobante")).status, 403);
  respond(/FROM dbo.Solicitudes AS s/);
  assert.equal((await request("GET", "/31")).status, 404);
  assert.equal((await request("GET", "/abc")).status, 400);
});

test("restaurante admite parámetro o query y conserva las restricciones del servicio", async () => {
  for (const Rol of roles.slice(1)) {
    identity = { UsuarioId: 7, Rol };
    for (const path of ["/restaurante/2", "/restaurante?restauranteId=2"]) {
      if (Rol === "GERENTE") respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
      respond(/FROM dbo.Incapacidades/, [solicitud]);
      assert.equal((await request("GET", path)).status, 200);
      assert.equal(calls.at(-1).parametros.restauranteId, 2);
    }
  }
  assert.equal((await request("GET", "/restaurante")).status, 400);
  identity = { UsuarioId: 7, Rol: "GERENTE" };
  respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
  respond(/FROM dbo.Incapacidades/, []);
  assert.equal((await request("GET", "/restaurante")).status, 200);
  respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
  assert.equal((await request("GET", "/restaurante/3")).status, 403);
});

test("cálculo tiene su propia ruta para RH y Administración", async () => {
  for (const Rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    identity = { UsuarioId: 7, Rol };
    respond(/FROM dbo.CalculosIncapacidad/, [{ CalculoId: 1, SolicitudId: 31 }]);
    assert.deepEqual(await (await request("GET", "/31/calculo")).json(), { CalculoId: 1, SolicitudId: 31 });
    assert.equal(calls.at(-1).parametros.solicitudId, 31);
  }
});

for (const gerente of [true, false]) {
  test(`revisión HTTP ${gerente ? "gerente" : "RH"} utiliza el actor autenticado`, async () => {
    identity = { UsuarioId: 7, Rol: gerente ? "GERENTE" : "RECURSOS_HUMANOS" };
    const anterior = { ...solicitud, Estado: gerente ? "PENDIENTE" : "EN_REVISION_RH" };
    const estado = gerente ? "EN_REVISION_RH" : "RECHAZADA";
    const campo = gerente ? "revisadoPorGerenteId" : "revisadoPorRhId";
    const nueva = { ...anterior, Estado: estado };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (gerente) {
      respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
      respond(/FROM dbo.Solicitudes AS s/, [anterior]);
      respond(/FROM Usuarios/, [{ RestauranteId: 2 }]);
    } else respond(/FROM dbo.Incapacidades/, [anterior]);
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: estado.toLowerCase(), observacion: " Revisada ", [campo]: 999,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), gerente ? nueva : { incapacidadActualizada: nueva, registroCalculoCreado: null });
    assert.equal(calls.at(-2).parametros[campo], 7);
    assert.equal(calls.at(-2).parametros.observacion, "Revisada");
    assert.equal(calls.at(-1).parametros.UsuarioId, 7);
    assert.equal((await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, { estado: "INVALIDO" })).status, 400);
  });
}

test("crea con multipart, guarda el archivo y permite descargarlo con acceso", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  respond(/FROM Colaboradores/, [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
  respond(/FROM dbo.TiposIncapacidad/, [{ TipoIncapacidadId: 1, Activo: true }]);
  respond(/i.NumeroDocumento = @numeroDocumento/);
  respond(/AND s.Estado IN/);
  respond(/INSERT INTO dbo.Solicitudes/, [{ SolicitudId: 31 }]);
  respond(/INSERT INTO dbo.Incapacidades/);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/INSERT INTO dbo.Bitacora/);
  let ruta;
  try {
    const response = await request("POST", "/", formulario());
    const detalle = calls.find(call => call.query.includes("INSERT INTO dbo.Incapacidades"));
    ruta = detalle?.parametros.comprobanteRuta;
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), solicitud);
    assert.match(ruta, /^incapacidades\/[\da-f-]+\.pdf$/);
    assert.equal(detalle.parametros.comprobanteNombre, "reposo.pdf");
    const cabecera = calls.find(call => call.query.includes("INSERT INTO dbo.Solicitudes"));
    assert.equal(cabecera.parametros.colaboradorId, 4);
    assert.equal(cabecera.parametros.registradoPorUsuarioId, 7);
    assert.deepEqual(await readFile(obtenerRutaComprobante(ruta)), pdf);
    respond(/FROM dbo.Solicitudes AS s/, [{ ...solicitud, ComprobanteRuta: ruta, ComprobanteNombre: "reposo.pdf" }]);
    const descarga = await request("GET", "/31/comprobante");
    assert.equal(descarga.status, 200);
    assert.match(descarga.headers.get("content-disposition"), /attachment;.*reposo.pdf/);
    assert.equal(descarga.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await descarga.arrayBuffer()), pdf);
  } finally {
    if (ruta) await eliminarComprobante(ruta);
  }
});

for (const caso of ["sin archivo", "tipo no permitido", "firma falsa", "extensión incorrecta", "excede tamaño", "dos archivos"]) {
  test(`subida rechaza ${caso} sin escribir ni consultar SQL`, async () => {
    identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
    const antes = await archivos();
    let form;
    if (caso === "sin archivo") form = formulario(null);
    else if (caso === "tipo no permitido") form = formulario(Buffer.from("hola"), "text/plain", "nota.txt");
    else if (caso === "firma falsa") form = formulario(Buffer.from("no es PDF"));
    else if (caso === "extensión incorrecta") form = formulario(pdf, "application/pdf", "reposo.html");
    else if (caso === "excede tamaño") form = formulario(Buffer.alloc(5 * 1024 * 1024 + 1));
    else {
      form = formulario();
      form.append("comprobante", new Blob([pdf], { type: "application/pdf" }), "segundo.pdf");
    }
    const response = await request("POST", "/", form);
    assert.equal(response.status, caso === "excede tamaño" ? 413 : 400);
    assert.equal(calls.length, 0);
    assert.deepEqual(await archivos(), antes);
  });
}

test("rechaza JSON con rutas inventadas y elimina el archivo si falla la validación del servicio", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  assert.equal((await request("POST", "/", { comprobanteRuta: "ajeno.pdf" })).status, 400);
  const antes = await archivos();
  const form = formulario();
  form.set("fechaInicio", "fecha inválida");
  assert.equal((await request("POST", "/", form)).status, 400);
  assert.deepEqual(await archivos(), antes);
  assert.equal(calls.length, 0);
});

test("una solicitud duplicada revierte SQL y elimina el comprobante recibido", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  const antes = await archivos();
  const rollbacks = sql.Transaction.prototype.rollback.mock.callCount();
  respond(/FROM Colaboradores/, [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{ ColaboradorId: 4 }]);
  respond(/FROM dbo.TiposIncapacidad/, [{ TipoIncapacidadId: 1, Activo: true }]);
  respond(/i.NumeroDocumento = @numeroDocumento/, [solicitud]);
  assert.equal((await request("POST", "/", formulario())).status, 409);
  assert.equal(sql.Transaction.prototype.rollback.mock.callCount(), rollbacks + 1);
  assert.deepEqual(await archivos(), antes);
});

test("descarga rechaza rutas externas y devuelve 404 para archivos ausentes", async () => {
  identity = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
  for (const ruta of ["../../.env", "C:\\archivo.pdf", null, "incapacidades/inexistente-para-test.pdf"]) {
    respond(/FROM dbo.Solicitudes AS s/, [{ ...solicitud, ComprobanteRuta: ruta }]);
    assert.equal((await request("GET", "/31/comprobante")).status, 404);
  }
});
