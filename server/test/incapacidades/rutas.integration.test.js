import { test, beforeEach, afterEach, jest, expect, beforeAll, afterAll } from "@jest/globals";
beforeEach(() => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => {
    const parametros = {};
    return {
      input(name, _type, value) {
        parametros[name] = value;
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        const respuesta = expected.shift();
        assert.ok(respuesta, `Consulta inesperada: ${query}`);
        expect(query).toMatch(respuesta.pattern);
        calls.push({
          query,
          parametros
        });
        if (respuesta.error) throw respuesta.error;
        return {
          recordset: respuesta.records ?? [],
          rowsAffected: [1]
        };
      }
    };
  });
  jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {});
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => pool.request());
});
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import session from "express-session";
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
  SESSION_SECRET: "solo-tests"
});
const {
  pool,
  sql
} = await import("../../src/shared/config/database.js");
const {
  default: app
} = await import("../../src/app.js");
const {
  eliminarComprobante,
  obtenerRutaComprobante
} = await import("../../src/modules/incapacidades/incapacidades.upload.js");
let expected, calls, identity, server, baseUrl;
const pdf = Buffer.from("%PDF-1.4\nComprobante ficticio para pruebas\n%%EOF");
const solicitud = {
  SolicitudId: 31,
  ColaboradorId: 4,
  RestauranteId: 2,
  Estado: "PENDIENTE"
};
const roles = ["COLABORADOR", "GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"];
beforeAll(async () => {
  const harness = express();
  harness.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));
  harness.use((req, _res, next) => {
    if (identity) req.session.user = {
      Activo: true,
      ...identity
    };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/incapacidades`;
});
afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  jest.restoreAllMocks();
});
beforeEach(() => {
  expected = [];
  calls = [];
  identity = undefined;
});
afterEach(() => assert.equal(expected.length, 0, "Faltan consultas esperadas"));
function respond(pattern, records = []) {
  expected.push({
    pattern,
    records
  });
}
async function request(method, path, body) {
  const multipart = body instanceof FormData;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: multipart ? {} : {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body)
  });
}
function formulario(buffer = pdf, tipo = "application/pdf", nombre = "reposo.pdf") {
  const form = new FormData();
  for (const [campo, valor] of Object.entries({
    restauranteId: "2",
    tipoIncapacidadId: "1",
    numeroDocumento: "CCSS-123",
    fechaInicio: "2026-10-06",
    fechaFin: "2026-10-08",
    motivo: "Reposo",
    colaboradorId: "999",
    registradoPorUsuarioId: "999",
    comprobanteRuta: "../../ajeno.pdf",
    comprobanteNombre: "ajeno.pdf"
  })) form.set(campo, valor);
  if (buffer) form.set("comprobante", new Blob([buffer], {
    type: tipo
  }), nombre);
  return form;
}
async function archivos() {
  try {
    return (await readdir(new URL("../uploads/incapacidades/", import.meta.url))).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
const rutas = [["GET", "/tipos", roles], ["GET", "/mis-incapacidades", ["COLABORADOR"]], ["GET", "/restaurante", roles.slice(1)], ["GET", "/restaurante/2", roles.slice(1)], ["GET", "/31", roles], ["GET", "/31/comprobante", roles], ["GET", "/31/calculo", ["RECURSOS_HUMANOS", "ADMINISTRADOR"]], ["POST", "/", ["COLABORADOR"]], ["PATCH", "/31/revisar-gerente", ["GERENTE"]], ["PATCH", "/31/resolver-rh", ["RECURSOS_HUMANOS"]]];
for (const [method, path, permitidos] of rutas) {
  test(`${method} ${path} exige sesión y los roles correspondientes`, async () => {
    expect((await request(method, path)).status).toBe(401);
    for (const Rol of [...roles.filter(rol => !permitidos.includes(rol)), "DESCONOCIDO"]) {
      identity = {
        UsuarioId: 7,
        ColaboradorId: 4,
        Rol
      };
      expect((await request(method, path)).status).toBe(403);
    }
    expect(calls.length).toBe(0);
  });
}
test("tipos y solicitudes propias usan rutas específicas y filtros normalizados", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  respond(/FROM dbo.TiposIncapacidad/, [{
    TipoIncapacidadId: 1
  }]);
  expect(await (await request("GET", "/tipos")).json()).toEqual([{
    TipoIncapacidadId: 1
  }]);
  respond(/FROM dbo.Incapacidades/, [solicitud]);
  const response = await request("GET", "/mis-incapacidades?colaboradorId=999&desde=2026-10-06&hasta=2026-10-08&estado=pendiente");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([solicitud]);
  expect(calls.at(-1).parametros.colaboradorId).toBe(4);
  expect(calls.at(-1).parametros.estado).toBe("PENDIENTE");
  expect(calls.at(-1).parametros.desde.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  expect((await request("GET", "/mis-incapacidades?hasta=2026-02-30")).status).toBe(400);
  expect((await request("GET", "/mis-incapacidades?estado=INVALIDO")).status).toBe(400);
});
test("detalle devuelve la solicitud y respeta al propietario y restaurante", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  expect(await (await request("GET", "/31")).json()).toEqual(solicitud);
  for (const path of ["/31", "/31/comprobante"]) {
    respond(/FROM dbo.Solicitudes AS s/, [{
      ...solicitud,
      ColaboradorId: 99
    }]);
    expect((await request("GET", path)).status).toBe(403);
  }
  identity = {
    UsuarioId: 7,
    Rol: "GERENTE"
  };
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/FROM Usuarios/, [{
    RestauranteId: 3
  }]);
  expect((await request("GET", "/31/comprobante")).status).toBe(403);
  respond(/FROM dbo.Solicitudes AS s/);
  expect((await request("GET", "/31")).status).toBe(404);
  expect((await request("GET", "/abc")).status).toBe(400);
});
test("restaurante admite parámetro o query y conserva las restricciones del servicio", async () => {
  for (const Rol of roles.slice(1)) {
    identity = {
      UsuarioId: 7,
      Rol
    };
    for (const path of ["/restaurante/2", "/restaurante?restauranteId=2"]) {
      if (Rol === "GERENTE") respond(/FROM Usuarios/, [{
        RestauranteId: 2
      }]);
      respond(/FROM dbo.Incapacidades/, [solicitud]);
      expect((await request("GET", path)).status).toBe(200);
      expect(calls.at(-1).parametros.restauranteId).toBe(2);
    }
  }
  identity = {
    UsuarioId: 7,
    Rol: "GERENTE"
  };
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  respond(/FROM dbo.Incapacidades/, []);
  expect((await request("GET", "/restaurante")).status).toBe(200);
  expect(calls.at(-1).parametros.restauranteId).toBe(2);
  respond(/FROM Usuarios/, [{
    RestauranteId: 2
  }]);
  expect((await request("GET", "/restaurante/3")).status).toBe(403);
});
test("RH y Administración consultan todos los restaurantes sin un filtro obligatorio", async () => {
  const solicitudes = [solicitud, {
    ...solicitud,
    SolicitudId: 32,
    RestauranteId: 3
  }];
  for (const Rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    identity = {
      UsuarioId: 7,
      Rol
    };
    respond(/FROM dbo.Incapacidades/, solicitudes);
    const response = await request("GET", "/restaurante?desde=2026-10-01&hasta=2026-10-31&estado=pendiente");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(solicitudes);
    const consulta = calls.at(-1);
    expect(consulta.parametros.restauranteId).toBe(null);
    expect(consulta.parametros.estado).toBe("PENDIENTE");
    expect(consulta.parametros.desde.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(consulta.query).toMatch(/@restauranteId IS NULL OR s.RestauranteId = @restauranteId/);
    expect((await request("GET", "/restaurante?restauranteId=abc")).status).toBe(400);
    expect((await request("GET", "/restaurante?estado=INVALIDO")).status).toBe(400);
  }
  expect(calls.every(consulta => !consulta.query.includes("FROM Usuarios"))).toBeTruthy();
});
test("cálculo tiene su propia ruta para RH y Administración", async () => {
  for (const Rol of ["RECURSOS_HUMANOS", "ADMINISTRADOR"]) {
    identity = {
      UsuarioId: 7,
      Rol
    };
    respond(/FROM dbo.CalculosIncapacidad/, [{
      CalculoId: 1,
      SolicitudId: 31
    }]);
    expect(await (await request("GET", "/31/calculo")).json()).toEqual({
      CalculoId: 1,
      SolicitudId: 31
    });
    expect(calls.at(-1).parametros.solicitudId).toBe(31);
  }
});
test("consulta de maternidad conserva todos los cálculos y devuelve el total sin atribuirlo a un solo período", async () => {
  identity = {
    UsuarioId: 7,
    Rol: "RECURSOS_HUMANOS"
  };
  const calculos = [{
    CalculoId: 1,
    SolicitudId: 31,
    PeriodoId: 8,
    MinutosReconocidos: 1440,
    PorcentajePatronalAplicado: 50
  }, {
    CalculoId: 2,
    SolicitudId: 31,
    PeriodoId: 9,
    MinutosReconocidos: 3360,
    PorcentajePatronalAplicado: 50
  }, {
    CalculoId: 3,
    SolicitudId: 31,
    PeriodoId: 10,
    MinutosReconocidos: 960,
    PorcentajePatronalAplicado: 50
  }];
  respond(/FROM dbo.CalculosIncapacidad/, calculos);
  const response = await request("GET", "/31/calculo");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    SolicitudId: 31,
    CalculoId: null,
    PeriodoId: null,
    MinutosReconocidos: 5760,
    PorcentajePatronalAplicado: 50,
    calculos
  });
});
test("consultar una lista vacía de cálculos devuelve 404", async () => {
  identity = {
    UsuarioId: 7,
    Rol: "RECURSOS_HUMANOS"
  };
  respond(/FROM dbo.CalculosIncapacidad/);
  expect((await request("GET", "/31/calculo")).status).toBe(404);
});
for (const gerente of [true, false]) {
  test(`revisión HTTP ${gerente ? "gerente" : "RH"} utiliza el actor autenticado`, async () => {
    identity = {
      UsuarioId: 7,
      Rol: gerente ? "GERENTE" : "RECURSOS_HUMANOS"
    };
    const anterior = {
      ...solicitud,
      Estado: gerente ? "PENDIENTE" : "EN_REVISION_RH"
    };
    const estado = gerente ? "EN_REVISION_RH" : "RECHAZADA";
    const campo = gerente ? "revisadoPorGerenteId" : "revisadoPorRhId";
    const nueva = {
      ...anterior,
      Estado: estado
    };
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
      ColaboradorId: 4
    }]);
    respond(/FROM dbo.Solicitudes AS s/, [anterior]);
    if (gerente) {
      respond(/FROM Usuarios/, [{
        RestauranteId: 2
      }]);
    }
    respond(/UPDATE dbo.Solicitudes/, [nueva]);
    respond(/INSERT INTO dbo.Bitacora/);
    const response = await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: estado.toLowerCase(),
      observacion: " Revisada ",
      [campo]: 999
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(gerente ? nueva : {
      incapacidadActualizada: nueva,
      registroCalculoCreado: null
    });
    expect(calls.at(-2).parametros[campo]).toBe(7);
    expect(calls.at(-2).parametros.observacion).toBe("Revisada");
    expect(calls.at(-1).parametros.UsuarioId).toBe(7);
    expect((await request("PATCH", `/31/${gerente ? "revisar-gerente" : "resolver-rh"}`, {
      estado: "INVALIDO"
    })).status).toBe(400);
  });
}
test("crea con multipart, guarda el archivo y permite descargarlo con acceso", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 4,
    RestauranteId: 2,
    Activo: true
  }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
    ColaboradorId: 4
  }]);
  respond(/FROM dbo.TiposIncapacidad/, [{
    TipoIncapacidadId: 1,
    Activo: true
  }]);
  respond(/i.NumeroDocumento = @numeroDocumento/);
  respond(/AND s.Estado IN/);
  respond(/INSERT INTO dbo.Solicitudes/, [{
    SolicitudId: 31
  }]);
  respond(/INSERT INTO dbo.Incapacidades/);
  respond(/FROM dbo.Solicitudes AS s/, [solicitud]);
  respond(/INSERT INTO dbo.Bitacora/);
  let ruta;
  try {
    const response = await request("POST", "/", formulario());
    const detalle = calls.find(call => call.query.includes("INSERT INTO dbo.Incapacidades"));
    ruta = detalle?.parametros.comprobanteRuta;
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(solicitud);
    expect(ruta).toMatch(/^incapacidades\/[\da-f-]+\.pdf$/);
    expect(detalle.parametros.comprobanteNombre).toBe("reposo.pdf");
    const cabecera = calls.find(call => call.query.includes("INSERT INTO dbo.Solicitudes"));
    expect(cabecera.parametros.colaboradorId).toBe(4);
    expect(cabecera.parametros.registradoPorUsuarioId).toBe(7);
    expect(await readFile(obtenerRutaComprobante(ruta))).toEqual(pdf);
    respond(/FROM dbo.Solicitudes AS s/, [{
      ...solicitud,
      ComprobanteRuta: ruta,
      ComprobanteNombre: "reposo.pdf"
    }]);
    const descarga = await request("GET", "/31/comprobante");
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get("content-disposition")).toMatch(/attachment;.*reposo.pdf/);
    expect(descarga.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await descarga.arrayBuffer())).toEqual(pdf);
  } finally {
    if (ruta) await eliminarComprobante(ruta);
  }
});
for (const caso of ["sin archivo", "tipo no permitido", "firma falsa", "extensión incorrecta", "excede tamaño", "dos archivos"]) {
  test(`subida rechaza ${caso} sin escribir ni consultar SQL`, async () => {
    identity = {
      UsuarioId: 7,
      ColaboradorId: 4,
      Rol: "COLABORADOR"
    };
    const antes = await archivos();
    let form;
    if (caso === "sin archivo") form = formulario(null);else if (caso === "tipo no permitido") form = formulario(Buffer.from("hola"), "text/plain", "nota.txt");else if (caso === "firma falsa") form = formulario(Buffer.from("no es PDF"));else if (caso === "extensión incorrecta") form = formulario(pdf, "application/pdf", "reposo.html");else if (caso === "excede tamaño") form = formulario(Buffer.alloc(5 * 1024 * 1024 + 1));else {
      form = formulario();
      form.append("comprobante", new Blob([pdf], {
        type: "application/pdf"
      }), "segundo.pdf");
    }
    const response = await request("POST", "/", form);
    expect(response.status).toBe(caso === "excede tamaño" ? 413 : 400);
    expect(calls.length).toBe(0);
    expect(await archivos()).toEqual(antes);
  });
}
test("rechaza JSON con rutas inventadas y elimina el archivo si falla la validación del servicio", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  expect((await request("POST", "/", {
    comprobanteRuta: "ajeno.pdf"
  })).status).toBe(400);
  const antes = await archivos();
  const form = formulario();
  form.set("fechaInicio", "fecha inválida");
  expect((await request("POST", "/", form)).status).toBe(400);
  expect(await archivos()).toEqual(antes);
  expect(calls.length).toBe(0);
});
test("una solicitud duplicada revierte SQL y elimina el comprobante recibido", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  const antes = await archivos();
  const rollbacks = sql.Transaction.prototype.rollback.mock.calls.length;
  respond(/FROM Colaboradores/, [{
    ColaboradorId: 4,
    RestauranteId: 2,
    Activo: true
  }]);
  respond(/WITH \(UPDLOCK, HOLDLOCK\)/, [{
    ColaboradorId: 4
  }]);
  respond(/FROM dbo.TiposIncapacidad/, [{
    TipoIncapacidadId: 1,
    Activo: true
  }]);
  respond(/i.NumeroDocumento = @numeroDocumento/, [solicitud]);
  expect((await request("POST", "/", formulario())).status).toBe(409);
  expect(sql.Transaction.prototype.rollback.mock.calls.length).toBe(rollbacks + 1);
  expect(await archivos()).toEqual(antes);
});
test("descarga rechaza rutas externas y devuelve 404 para archivos ausentes", async () => {
  identity = {
    UsuarioId: 7,
    ColaboradorId: 4,
    Rol: "COLABORADOR"
  };
  for (const ruta of ["../../.env", "C:\\archivo.pdf", null, "incapacidades/inexistente-para-test.pdf"]) {
    respond(/FROM dbo.Solicitudes AS s/, [{
      ...solicitud,
      ComprobanteRuta: ruta
    }]);
    expect((await request("GET", "/31/comprobante")).status).toBe(404);
  }
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
