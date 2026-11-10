import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { pool } from "../../src/shared/config/database.js";
import { listarDetallesAguinaldo } from "../../src/modules/aguinaldos/aguinaldo.service.js";

// Servicio y repositorios reales con transporte SQL simulado.
const detalle = {
  DetalleAguinaldoId: 80,
  AguinaldoId: 10,
  Anio: 2026,
  Estado: "CONFIRMADO",
  ColaboradorId: 2018,
  RestauranteId: 2,
  SalarioAcumulado: 3600000,
  MontoAguinaldo: 300000,
};
let consultas;
let asignacion;
let filas;
let errorConsulta;

beforeEach(() => {
  consultas = [];
  asignacion = { RestauranteId: 2 };
  filas = [detalle];
  errorConsulta = null;
  jest.spyOn(pool, "connect").mockResolvedValue(pool);
  jest.spyOn(pool, "request").mockImplementation(() => {
    const parametros = {};
    return {
      input(nombre, _tipo, valor) {
        parametros[nombre] = valor;
        return this;
      },
      async query(query) {
        consultas.push({ query, parametros });
        if (query.includes("FROM Usuarios AS u")) {
          return { recordset: asignacion ? [asignacion] : [] };
        }
        expect(query).toMatch(/FROM dbo.DetallesAguinaldo AS da/);
        if (errorConsulta) throw errorConsulta;
        return { recordset: filas };
      },
    };
  });
});

afterEach(() => jest.restoreAllMocks());

describe("Consulta de detalles confirmados de aguinaldo", () => {
  test.each(["ADMINISTRADOR", "RECURSOS_HUMANOS"])(
    "%s puede consultar sin filtros opcionales",
    async (Rol) => {
      await expect(listarDetallesAguinaldo({ Rol })).resolves.toEqual([
        detalle,
      ]);
      expect(consultas).toHaveLength(1);
      expect(consultas[0].parametros).toEqual({
        aguinaldoId: null,
        anio: null,
        colaboradorId: null,
        restauranteId: null,
      });
      expect(consultas[0].query).toMatch(/WHERE a.Estado = 'CONFIRMADO'/);
    },
  );

  test("normaliza filtros de consulta sin modificarlos y envía un año numérico", async () => {
    const filtros = Object.freeze({
      aguinaldoId: "10",
      anio: "2026",
      colaboradorId: "2018",
      restauranteId: "2",
    });
    await listarDetallesAguinaldo({ Rol: "RECURSOS_HUMANOS" }, filtros);
    expect(consultas[0].parametros).toEqual({
      aguinaldoId: 10,
      anio: 2026,
      colaboradorId: 2018,
      restauranteId: 2,
    });
    expect(filtros.anio).toBe("2026");
  });

  test.each([null, ""])(
    "un filtro opcional %p se envía como NULL",
    async (valor) => {
      await listarDetallesAguinaldo(
        { Rol: "ADMINISTRADOR" },
        {
          aguinaldoId: valor,
          anio: valor,
          colaboradorId: valor,
          restauranteId: valor,
        },
      );
      expect(Object.values(consultas[0].parametros)).toEqual([
        null,
        null,
        null,
        null,
      ]);
    },
  );

  test.each([1900, 9999])(
    "admite el límite de año %i definido por la migración",
    async (anio) => {
      await listarDetallesAguinaldo({ Rol: "ADMINISTRADOR" }, { anio });
      expect(consultas[0].parametros.anio).toBe(anio);
    },
  );

  test("el colaborador solo consulta su identidad de sesión e ignora el alcance solicitado", async () => {
    const filtros = Object.freeze({
      anio: "2026",
      colaboradorId: "999",
      restauranteId: "otro",
    });
    await listarDetallesAguinaldo(
      { Rol: "COLABORADOR", ColaboradorId: "2018" },
      filtros,
    );
    expect(consultas).toHaveLength(1);
    expect(consultas[0].parametros).toEqual({
      aguinaldoId: null,
      anio: 2026,
      colaboradorId: 2018,
      restauranteId: null,
    });
    expect(filtros.colaboradorId).toBe("999");
    expect(filtros.restauranteId).toBe("otro");
  });

  test("el gerente consulta su asignación vigente y conserva el filtro por colaborador", async () => {
    const filtros = Object.freeze({ restauranteId: 99, colaboradorId: "2018" });
    await listarDetallesAguinaldo(
      { Rol: "GERENTE", UsuarioId: 7, RestauranteId: 99 },
      filtros,
    );
    expect(consultas).toHaveLength(2);
    expect(consultas[0].parametros.usuarioId).toBe(7);
    expect(consultas[1].parametros).toEqual({
      aguinaldoId: null,
      anio: null,
      colaboradorId: 2018,
      restauranteId: 2,
    });
    expect(consultas[1].query).toMatch(/da.RestauranteId = @restauranteId/);
    expect(filtros.restauranteId).toBe(99);
  });

  test("sin asignación vigente el gerente no obtiene una consulta general", async () => {
    asignacion = null;
    await expect(
      listarDetallesAguinaldo({ Rol: "GERENTE", UsuarioId: 7 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].query).not.toMatch(/FROM dbo.DetallesAguinaldo/);
  });

  test.each([undefined, null, {}, { Rol: "DESCONOCIDO" }])(
    "rechaza un usuario no autorizado %p antes de consultar",
    async (usuario) => {
      await expect(listarDetallesAguinaldo(usuario)).rejects.toMatchObject({
        status: 403,
      });
      expect(consultas).toEqual([]);
    },
  );

  test.each([undefined, null, "", "incorrecto", 0])(
    "no permite consultar al colaborador sin una identidad válida: %p",
    async (ColaboradorId) => {
      await expect(
        listarDetallesAguinaldo({ Rol: "COLABORADOR", ColaboradorId }),
      ).rejects.toMatchObject({ status: 400 });
      expect(consultas).toEqual([]);
    },
  );

  test.each([null, [], "2026", 2026])(
    "rechaza filtros que no sean un objeto: %p",
    async (filtros) => {
      await expect(
        listarDetallesAguinaldo({ Rol: "ADMINISTRADOR" }, filtros),
      ).rejects.toMatchObject({ status: 400 });
      expect(consultas).toEqual([]);
    },
  );

  test.each([
    { anio: 1899 },
    { anio: 10000 },
    { anio: 2026.5 },
    { anio: Infinity },
    { anio: "otro" },
    { anio: true },
    { aguinaldoId: 0 },
    { colaboradorId: -1 },
    { restauranteId: "abc" },
  ])(
    "rechaza el filtro inválido %p antes de acceder a SQL",
    async (filtros) => {
      await expect(
        listarDetallesAguinaldo({ Rol: "ADMINISTRADOR" }, filtros),
      ).rejects.toMatchObject({ status: 400 });
      expect(consultas).toEqual([]);
    },
  );

  test("valida los filtros del gerente antes de consultar su asignación", async () => {
    await expect(
      listarDetallesAguinaldo(
        { Rol: "GERENTE", UsuarioId: 7 },
        { anio: 2026.5 },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(consultas).toEqual([]);
  });

  test("un historial sin resultados devuelve una lista vacía", async () => {
    filas = [];
    await expect(
      listarDetallesAguinaldo({ Rol: "ADMINISTRADOR" }, { anio: 2026 }),
    ).resolves.toEqual([]);
  });

  test("propaga el error del repositorio y no escribe datos", async () => {
    errorConsulta = new Error("Fallo SQL simulado");
    await expect(
      listarDetallesAguinaldo({ Rol: "ADMINISTRADOR" }),
    ).rejects.toBe(errorConsulta);
    expect(
      consultas.every((c) => !/\b(INSERT|UPDATE|DELETE)\b/.test(c.query)),
    ).toBe(true);
  });
});
