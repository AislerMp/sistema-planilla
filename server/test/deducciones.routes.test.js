import assert from "node:assert/strict";
import { test, before, after, beforeEach, mock } from "node:test";
import { once } from "node:events";
import express from "express";
import session from "express-session";

Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
  SESSION_SECRET: "solo-tests",
});

const { pool } = await import("../src/shared/config/database.js");
const { default: app } = await import("../src/app.js");

let server;
let baseUrl;
let identity;
let consultas;
let filas;

mock.method(console, "error", () => {});
mock.method(pool, "connect", async () => pool);
mock.method(pool, "request", () => {
  const parametros = {};
  return {
    input(nombre, _tipo, valor) {
      parametros[nombre] = valor;
      return this;
    },
    async query(sql) {
      consultas.push({ sql, parametros });
      return { recordset: filas };
    },
  };
});

before(async () => {
  const harness = express();
  harness.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  harness.use((req, _res, next) => {
    if (identity) req.session.user = { Activo: true, UsuarioId: 7, ColaboradorId: 4, ...identity };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/deducciones`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
});

beforeEach(() => {
  identity = null;
  consultas = [];
  filas = [];
});

test("las rutas requieren sesión y las escrituras del catálogo son exclusivas de Administración", async () => {
  assert.equal((await fetch(`${baseUrl}/catalogo`)).status, 401);
  identity = { Rol: "COLABORADOR" };
  assert.equal((await fetch(`${baseUrl}/catalogo`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${baseUrl}/solicitudes/1/resolver-rh`, { method: "PATCH" })).status, 403);
  identity = { Rol: "RECURSOS_HUMANOS" };
  assert.equal((await fetch(`${baseUrl}/catalogo`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${baseUrl}/catalogo/1`, { method: "PATCH" })).status, 403);
  assert.equal((await fetch(`${baseUrl}/solicitudes`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${baseUrl}/catalogo`)).status, 200);
  identity = { Rol: "GERENTE" };
  assert.equal((await fetch(`${baseUrl}/catalogo`)).status, 403);
  assert.equal(consultas.length, 1);
});

test("el catálogo transmite filtros validados al repositorio", async () => {
  identity = { Rol: "COLABORADOR" };
  filas = [{ DeduccionId: 2, Codigo: "ASOCIACION" }];
  const response = await fetch(`${baseUrl}/catalogo?tipoDeduccion=adicional&codigo=asociacion&fechaVigencia=2026-10-21`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), filas);
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].parametros.tipoDeduccion, "ADICIONAL");
  assert.equal(consultas[0].parametros.codigo, "ASOCIACION");
  assert.ok(consultas[0].parametros.fechaVigencia instanceof Date);
});

test("RH consulta todos los restaurantes cuando omite el filtro", async () => {
  identity = { Rol: "RECURSOS_HUMANOS" };
  const response = await fetch(`${baseUrl}/restaurante?estado=pendiente`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].parametros.restauranteId, null);
  assert.match(consultas[0].sql, /@restauranteId IS NULL OR s\.RestauranteId = @restauranteId/);
  assert.equal(consultas[0].parametros.estado, "PENDIENTE");
});

test("el gerente queda limitado a su restaurante asignado", async () => {
  identity = { Rol: "GERENTE" };
  filas = [{ RestauranteId: 2 }];
  const response = await fetch(`${baseUrl}/restaurante?restauranteId=3`);
  assert.equal(response.status, 403);
  assert.equal(consultas.length, 1);
  assert.match(consultas[0].sql, /Usuarios|Colaboradores/i);
});

test("la solicitud rechaza porcentajes inválidos antes de abrir una transacción", async () => {
  identity = { Rol: "COLABORADOR" };
  filas = [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }];
  const response = await fetch(`${baseUrl}/solicitudes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deduccionId: 1,
      porcentajeSolicitado: "abc",
      fechaInicio: "2026-12-01",
    }),
  });
  assert.equal(response.status, 400);
  assert.equal(consultas.length, 1);
});

test("crear deducción valida fechas y decimales antes de guardar", async () => {
  identity = { Rol: "ADMINISTRADOR" };
  const datos = {
    tipoDeduccion: "LEGAL",
    codigo: "PRUEBA_LEGAL",
    nombre: "Deducción de prueba",
    porcentaje: 5.5,
    fechaVigenciaInicio: "2099-01-05",
    fechaVigenciaFin: "2099-01-10",
  };

  for (const [cambio, mensaje] of [
    [{ fechaVigenciaFin: "2099-01-04" }, /fin de vigencia/i],
    [{ fechaVigenciaInicio: "2020-01-01" }, /comenzar hoy/i],
    [{ porcentaje: 5.555 }, /dos decimales/i],
  ]) {
    const response = await fetch(`${baseUrl}/catalogo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, ...cambio }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).message, mensaje);
    assert.equal(consultas.length, 0);
  }
});
