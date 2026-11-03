import { test, beforeEach, afterEach, jest, expect, beforeAll, afterAll } from "@jest/globals";
beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => {
    const parametros = {};
    return {
      input(nombre, _tipo, valor) {
        parametros[nombre] = valor;
        return this;
      },
      async query(sql) {
        consultas.push({
          sql,
          parametros
        });
        return {
          recordset: filas
        };
      }
    };
  });
});
import assert from "node:assert/strict";
import { once } from "node:events";
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
let server;
let baseUrl;
let identity;
let consultas;
let filas;
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
      UsuarioId: 7,
      ColaboradorId: 4,
      ...identity
    };
    next();
  });
  harness.use(app);
  server = harness.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/deducciones`;
});
afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  jest.restoreAllMocks();
});
beforeEach(() => {
  identity = null;
  consultas = [];
  filas = [];
});
test("las rutas requieren sesión y las escrituras del catálogo son exclusivas de Administración", async () => {
  expect((await fetch(`${baseUrl}/catalogo`)).status).toBe(401);
  identity = {
    Rol: "COLABORADOR"
  };
  expect((await fetch(`${baseUrl}/catalogo`, {
    method: "POST"
  })).status).toBe(403);
  expect((await fetch(`${baseUrl}/solicitudes/1/resolver-rh`, {
    method: "PATCH"
  })).status).toBe(403);
  identity = {
    Rol: "RECURSOS_HUMANOS"
  };
  expect((await fetch(`${baseUrl}/catalogo`, {
    method: "POST"
  })).status).toBe(403);
  expect((await fetch(`${baseUrl}/catalogo/1`, {
    method: "PATCH"
  })).status).toBe(403);
  expect((await fetch(`${baseUrl}/solicitudes`, {
    method: "POST"
  })).status).toBe(403);
  expect((await fetch(`${baseUrl}/catalogo`)).status).toBe(200);
  identity = {
    Rol: "GERENTE"
  };
  expect((await fetch(`${baseUrl}/catalogo`)).status).toBe(403);
  expect(consultas.length).toBe(1);
});
test("el catálogo transmite filtros validados al repositorio", async () => {
  identity = {
    Rol: "COLABORADOR"
  };
  filas = [{
    DeduccionId: 2,
    Codigo: "ASOCIACION"
  }];
  const response = await fetch(`${baseUrl}/catalogo?tipoDeduccion=adicional&codigo=asociacion&fechaVigencia=2026-10-21`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(filas);
  expect(consultas.length).toBe(1);
  expect(consultas[0].parametros.tipoDeduccion).toBe("ADICIONAL");
  expect(consultas[0].parametros.codigo).toBe("ASOCIACION");
  expect(consultas[0].parametros.fechaVigencia instanceof Date).toBeTruthy();
});
test("RH consulta todos los restaurantes cuando omite el filtro", async () => {
  identity = {
    Rol: "RECURSOS_HUMANOS"
  };
  const response = await fetch(`${baseUrl}/restaurante?estado=pendiente`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  expect(consultas.length).toBe(1);
  expect(consultas[0].parametros.restauranteId).toBe(null);
  expect(consultas[0].sql).toMatch(/@restauranteId IS NULL OR s\.RestauranteId = @restauranteId/);
  expect(consultas[0].parametros.estado).toBe("PENDIENTE");
});
test("el gerente queda limitado a su restaurante asignado", async () => {
  identity = {
    Rol: "GERENTE"
  };
  filas = [{
    RestauranteId: 2
  }];
  const response = await fetch(`${baseUrl}/restaurante?restauranteId=3`);
  expect(response.status).toBe(403);
  expect(consultas.length).toBe(1);
  expect(consultas[0].sql).toMatch(/Usuarios|Colaboradores/i);
});
test("la solicitud rechaza porcentajes inválidos antes de abrir una transacción", async () => {
  identity = {
    Rol: "COLABORADOR"
  };
  filas = [{
    ColaboradorId: 4,
    RestauranteId: 2,
    Activo: true
  }];
  const response = await fetch(`${baseUrl}/solicitudes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      deduccionId: 1,
      porcentajeSolicitado: "abc",
      fechaInicio: "2026-12-01"
    })
  });
  expect(response.status).toBe(400);
  expect(consultas.length).toBe(1);
});
test("crear deducción valida fechas y decimales antes de guardar", async () => {
  identity = {
    Rol: "ADMINISTRADOR"
  };
  const datos = {
    tipoDeduccion: "LEGAL",
    codigo: "PRUEBA_LEGAL",
    nombre: "Deducción de prueba",
    porcentaje: 5.5,
    fechaVigenciaInicio: "2099-01-05",
    fechaVigenciaFin: "2099-01-10"
  };
  for (const [cambio, mensaje] of [[{
    fechaVigenciaFin: "2099-01-04"
  }, /fin de vigencia/i], [{
    fechaVigenciaInicio: "2020-01-01"
  }, /comenzar hoy/i], [{
    porcentaje: 5.555
  }, /dos decimales/i]]) {
    const response = await fetch(`${baseUrl}/catalogo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...datos,
        ...cambio
      })
    });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(mensaje);
    expect(consultas.length).toBe(0);
  }
});
test.each([
  ["confirma catálogo y bitácora", "exito", 201],
  ["rechaza un código duplicado", "duplicado", 409],
  ["revierte si falla la bitácora", "bitacora", 500],
])("crear una deducción por HTTP: %s", async (_descripcion, escenario, estado) => {
  identity = { Rol: "ADMINISTRADOR" };
  const eventos = [];
  const escrituras = [];
  const guardada = {
    DeduccionId: 91, Nombre: "Deducción de prueba", Codigo: "PRUEBA_JEST",
    TipoDeduccion: "LEGAL", Porcentaje: 5.5,
    FechaVigenciaInicio: "2099-01-05", FechaVigenciaFin: null,
  };
  for (const operacion of ["begin", "commit", "rollback"]) {
    jest.spyOn(sql.Transaction.prototype, operacion).mockImplementation(async function () {
      eventos.push({ operacion, transaction: this });
    });
  }
  jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(function () {
    const transaction = this;
    const parametros = {};
    return {
      input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
      async query(query) {
        if (query.includes("SELECT TOP (1)")) {
          return { recordset: escenario === "duplicado" ? [{ CodigoDuplicado: 1 }] : [] };
        }
        escrituras.push({ query, parametros, transaction });
        if (query.includes("INSERT INTO dbo.Deducciones")) return { recordset: [guardada] };
        if (query.includes("INSERT INTO dbo.Bitacora")) {
          if (escenario === "bitacora") throw new Error("Fallo de auditoría simulado");
          return { recordset: [], rowsAffected: [1] };
        }
        throw new Error(`Consulta inesperada: ${query}`);
      },
    };
  });

  const response = await fetch(`${baseUrl}/catalogo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: guardada.Nombre, codigo: guardada.Codigo,
      tipoDeduccion: "LEGAL", porcentaje: 5.5,
      fechaVigenciaInicio: "2099-01-05", usuarioId: 999,
    }),
  });

  expect(response.status).toBe(estado);
  expect(eventos.map(e => e.operacion)).toEqual(["begin", escenario === "exito" ? "commit" : "rollback"]);
  expect(escrituras.every(e => e.transaction === eventos[0].transaction)).toBe(true);
  if (escenario === "duplicado") expect(escrituras).toHaveLength(0);
  else {
    expect(escrituras).toHaveLength(2);
    expect(escrituras[0].parametros.porcentaje).toBe(5.5);
    expect(escrituras[1].parametros.UsuarioId).toBe(7);
    expect(escrituras[1].parametros.RegistroId).toBe(91);
  }
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
