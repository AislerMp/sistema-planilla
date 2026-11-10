import { afterEach, expect, jest, test } from "@jest/globals";
import { getSalarioPromedio } from "../../src/modules/planillas/repositories/detallesPlanilla.repository.js";

const fecha = (valor) => new Date(`${valor}T00:00:00.000Z`);
const periodo = (inicio, fin, salario, extra = {}) => ({
  FechaInicio: fecha(inicio),
  FechaFin: fecha(fin),
  SalarioComputable: salario,
  ConceptosIncapacidad: 0,
  ...extra,
});

function crearHistorial(periodos, ingreso = "2020-01-01", salida = null) {
  const consultas = [];
  const transaction = {
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) {
          parametros[nombre] = valor;
          return this;
        },
        async query(sql) {
          consultas.push({ sql, parametros });
          return {
            recordset: consultas.length === 1
              ? ingreso ? [{ FechaIngreso: fecha(ingreso), FechaSalida: salida ? fecha(salida) : null }] : []
              : periodos,
          };
        },
      };
    },
  };
  return { transaction, consultas };
}

function mesesJulioOctubre(salario = 450000) {
  return [
    periodo("2026-07-01", "2026-07-31", salario),
    periodo("2026-08-01", "2026-08-31", salario),
    periodo("2026-09-01", "2026-09-30", salario),
    periodo("2026-10-01", "2026-10-31", salario),
  ];
}

test("cuatro meses completos se dividen entre cuatro, aunque sumen 123 días", async () => {
  const { transaction } = crearHistorial(mesesJulioOctubre(), "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).resolves.toBe(450000);
});

test("seis meses limitan el intervalo y el promedio a seis, con parámetros SQL", async () => {
  const { transaction, consultas } = crearHistorial([
    periodo("2026-06-01", "2026-06-30", 450000),
    ...mesesJulioOctubre(),
    periodo("2026-11-01", "2026-11-30", 450000),
  ]);
  await expect(getSalarioPromedio("7", fecha("2026-11-30"), transaction)).resolves.toBe(450000);
  expect(consultas[1].parametros).toEqual({
    colaboradorId: 7,
    desde: fecha("2026-06-01"),
    hasta: fecha("2026-11-30"),
  });
  expect(consultas[1].sql).toContain("pp.Estado = 'PAGADO'");
  expect(consultas[1].sql).toContain("pp.FechaInicio <= @hasta");
  expect(consultas[1].sql).toContain("pp.FechaFin >= @desde");
  expect(consultas[1].sql).toContain("'EXTRAS_FERIADO', 'VACACIONES'");
  expect(consultas[1].sql).not.toMatch(/GETDATE|dp\.TotalIngresos|\bp\.FechaInicio/);
});

test("un período de catorce días que cruza el inicio aporta solo los siete incluidos", async () => {
  const { transaction } = crearHistorial([
    periodo("2026-05-25", "2026-06-07", 140000),
    periodo("2026-06-08", "2026-06-30", 230000),
    periodo("2026-07-01", "2026-07-31", 310000),
    periodo("2026-08-01", "2026-08-31", 310000),
    periodo("2026-09-01", "2026-09-30", 300000),
    periodo("2026-10-01", "2026-10-31", 310000),
    periodo("2026-11-01", "2026-11-30", 300000),
  ]);
  await expect(getSalarioPromedio(7, "2026-11-30", transaction)).resolves.toBe(305000);
});

test.each([
  ["2026-02-01", "2026-02-14", "2026-02-01", "2026-02-14", 225000, null, 450000],
  ["2024-02-01", "2024-02-29", "2024-02-01", "2024-02-29", 450000, null, 450000],
  ["2026-02-01", "2026-02-01", "2026-02-01", "2026-02-01", 16000, null, 448000],
  ["2026-10-01", "2026-10-15", "2026-10-01", "2026-10-31", 310000, null, 310000],
  ["2026-10-01", "2026-10-15", "2026-10-01", "2026-10-31", 150000, "2026-10-15", 310000],
  ["2026-07-15", "2026-07-31", "2026-07-01", "2026-07-31", 170000, null, 310000],
])("fracciones e ingreso/salida dentro de la planilla: %s a %s", async (
  ingreso, salida, inicioPeriodo, finPeriodo, salario, salidaRegistrada, esperado,
) => {
  const { transaction } = crearHistorial(
    [periodo(inicioPeriodo, finPeriodo, salario)], ingreso, salidaRegistrada,
  );
  await expect(getSalarioPromedio(7, salida, transaction)).resolves.toBe(esperado);
});

test("acepta importes decimales de SQL y redondea solamente el resultado final", async () => {
  const { transaction } = crearHistorial(mesesJulioOctubre("450000.13"), "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).resolves.toBe(450000.13);
});

test("un salario cero registrado es distinto de la falta de historial", async () => {
  const { transaction } = crearHistorial(mesesJulioOctubre(0), "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).resolves.toBe(0);
});

test.each([
  [],
  mesesJulioOctubre().slice(1),
  mesesJulioOctubre().filter((_fila, indice) => indice !== 1),
  mesesJulioOctubre().slice(0, -1),
].map((filas) => [filas]))("el historial incompleto no se interpreta como meses con salario cero: %#", async (filas) => {
  const { transaction } = crearHistorial(filas, "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toMatchObject({ status: 409 });
});

test("rechaza períodos superpuestos para no duplicar salarios", async () => {
  const filas = mesesJulioOctubre();
  filas.splice(1, 0, filas[0]);
  const { transaction } = crearHistorial(filas, "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toThrow("superpuestos");
});

test("no calcula silenciosamente un promedio ordinario sobre incapacidades", async () => {
  const filas = mesesJulioOctubre();
  filas[0].ConceptosIncapacidad = 1;
  const { transaction } = crearHistorial(filas, "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toThrow("incapacidades");
});

test.each([-1, "no numérico"])("rechaza un importe salarial inválido: %s", async (salario) => {
  const { transaction } = crearHistorial(mesesJulioOctubre(salario), "2026-07-01");
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toMatchObject({ status: 409 });
});

test("un colaborador inexistente no devuelve un salario ficticio de cero", async () => {
  const { transaction, consultas } = crearHistorial([], null);
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toMatchObject({ status: 404 });
  expect(consultas).toHaveLength(1);
});

test.each([
  ["2026-07-01", null, "2026-06-30"],
  ["2026-07-01", "2026-10-15", "2026-10-16"],
])("rechaza un corte fuera del vínculo laboral", async (ingreso, salidaRegistrada, corte) => {
  const { transaction, consultas } = crearHistorial([], ingreso, salidaRegistrada);
  await expect(getSalarioPromedio(7, corte, transaction)).rejects.toMatchObject({ status: 400 });
  expect(consultas).toHaveLength(1);
});

test.each([
  [0, "2026-10-31"],
  [7, undefined],
  [7, "2026-02-30"],
  [7, new Date("inválida")],
])("valida identificador y fecha antes de consultar: %#", async (id, corte) => {
  const { transaction, consultas } = crearHistorial([]);
  await expect(getSalarioPromedio(id, corte, transaction)).rejects.toMatchObject({ status: 400 });
  expect(consultas).toHaveLength(0);
});

test("propaga fallos de SQL sin convertirlos a salario cero", async () => {
  const error = new Error("Fallo SQL simulado");
  const transaction = {
    request: () => ({
      input() { return this; },
      async query() { throw error; },
    }),
  };
  await expect(getSalarioPromedio(7, "2026-10-31", transaction)).rejects.toBe(error);
});

afterEach(() => jest.restoreAllMocks());
