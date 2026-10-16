import assert from "node:assert/strict";
import { test } from "node:test";

// Se simulan los requests de la transacción; nunca se conecta a SQL Server.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { registrarCalculoVacaciones } = await import(
  "../src/modules/vacaciones/services/calculosVacaciones.service.js"
);

const fecha = (texto) => new Date(`${texto}T00:00:00.000Z`);
const solicitudBase = {
  SolicitudId: 31, Estado: "APROBADA", DiasSolicitados: 14,
  FechaInicio: fecha("2026-10-15"), FechaFin: fecha("2026-10-28"),
};
const periodosBase = [
  { PeriodoId: 3, FechaInicio: fecha("2026-10-05"), FechaFin: fecha("2026-10-18"), Estado: "ABIERTO" },
  { PeriodoId: 9, FechaInicio: fecha("2026-10-19"), FechaFin: fecha("2026-11-01"), Estado: "PROGRAMADO" },
];

function prepararBD(opciones = {}) {
  const consultas = [];
  const escrituras = [];
  const solicitud = opciones.solicitud === null ? null : { ...solicitudBase, ...opciones.solicitud };
  const periodos = opciones.periodos ?? periodosBase;
  const errorOriginal = new Error("Fallo al insertar el segundo cálculo");
  const transaction = {
    commit() { assert.fail("El cálculo no debe confirmar la transacción de RH"); },
    rollback() { assert.fail("El cálculo no debe revertir la transacción de RH"); },
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
        async query(query) {
          consultas.push({ query, parametros });
          if (query.includes("INSERT INTO dbo.CalculosVacaciones")) {
            escrituras.push(parametros);
            if (opciones.falloSegundo && escrituras.length === 2) throw errorOriginal;
            if (opciones.sinSegundo && escrituras.length === 2) return { recordset: [] };
            return { recordset: [{
              CalculoVacacionId: escrituras.length, SolicitudId: parametros.solicitudId,
              PeriodoId: parametros.periodoId, FechaInicioReconocida: parametros.fechaInicioReconocida,
              FechaFinReconocida: parametros.fechaFinReconocida, DiasReconocidos: parametros.diasReconocidos,
              MinutosReconocidos: parametros.minutosReconocidos,
            }] };
          }
          if (query.includes("FROM dbo.CalculosVacaciones")) return { recordset: opciones.existentes ?? [] };
          if (query.includes("FROM dbo.Solicitudes AS s")) return { recordset: solicitud ? [solicitud] : [] };
          if (query.includes("FROM dbo.PeriodosPlanilla")) return {
            recordset: periodos.filter((p) => parametros.FechaAsignada >= p.FechaInicio && parametros.FechaAsignada <= p.FechaFin),
          };
          assert.fail(`Consulta inesperada: ${query}`);
        },
      };
    },
  };
  const ejecutar = () => registrarCalculoVacaciones({ SolicitudId: "31" }, transaction, "7");
  return { ejecutar, consultas, escrituras, transaction, errorOriginal };
}

test("distribuye catorce días en cuatro y diez, con fechas y períodos distintos", async () => {
  const bd = prepararBD();
  const calculos = await bd.ejecutar();
  assert.deepEqual(calculos.map((c) => ({
    periodo: c.PeriodoId, inicio: c.FechaInicioReconocida.toISOString().slice(0, 10),
    fin: c.FechaFinReconocida.toISOString().slice(0, 10), dias: c.DiasReconocidos,
  })), [
    { periodo: 3, inicio: "2026-10-15", fin: "2026-10-18", dias: 4 },
    { periodo: 9, inicio: "2026-10-19", fin: "2026-10-28", dias: 10 },
  ]);
  assert.equal(bd.escrituras.length, 2);
  assert.deepEqual(calculos.map((c) => c.MinutosReconocidos), [1920, 4800]);
  assert.equal(calculos.reduce((total, c) => total + c.MinutosReconocidos, 0), 14 * 480);
  assert.deepEqual(bd.consultas.filter((c) => c.query.includes("FROM dbo.PeriodosPlanilla"))
    .map((c) => c.parametros.FechaAsignada.toISOString().slice(0, 10)), ["2026-10-15", "2026-10-19"]);
});

for (const caso of [
  { inicio: "2026-10-15", fin: "2026-10-18", dias: 4, periodo: 3 },
  { inicio: "2026-10-18", fin: "2026-10-18", dias: 1, periodo: 3 },
  { inicio: "2026-10-19", fin: "2026-10-28", dias: 10, periodo: 9 },
]) {
  test(`un solo registro para ${caso.inicio} al ${caso.fin}, contando ambos extremos`, async () => {
    const bd = prepararBD({ solicitud: {
      FechaInicio: fecha(caso.inicio), FechaFin: fecha(caso.fin), DiasSolicitados: caso.dias,
    } });
    const calculos = await bd.ejecutar();
    assert.equal(calculos.length, 1);
    assert.equal(calculos[0].PeriodoId, caso.periodo);
    assert.equal(calculos[0].DiasReconocidos, caso.dias);
    assert.equal(calculos[0].MinutosReconocidos, caso.dias * 480);
    assert.equal(calculos[0].FechaFinReconocida.getTime(), fecha(caso.fin).getTime());
  });
}

test("distribuye fechas UTC al cruzar de diciembre a enero", async () => {
  const bd = prepararBD({
    solicitud: { FechaInicio: fecha("2026-12-31"), FechaFin: fecha("2027-01-02"), DiasSolicitados: 3 },
    periodos: [
      { PeriodoId: 20, FechaInicio: fecha("2026-12-21"), FechaFin: fecha("2026-12-31"), Estado: "PROGRAMADO" },
      { PeriodoId: 25, FechaInicio: fecha("2027-01-01"), FechaFin: fecha("2027-01-14"), Estado: "PROGRAMADO" },
    ],
  });
  const calculos = await bd.ejecutar();
  assert.deepEqual(calculos.map((c) => [c.PeriodoId, c.DiasReconocidos]), [[20, 1], [25, 2]]);
  assert.equal(calculos[1].FechaInicioReconocida.toISOString().slice(0, 10), "2027-01-01");
});

for (const caso of [
  { nombre: "cálculos existentes", existentes: [{ CalculoVacacionId: 1 }], status: 409 },
  { nombre: "solicitud inexistente", solicitud: null, status: 404 },
  { nombre: "solicitud sin aprobar", solicitud: { Estado: "EN_REVISION_RH" }, status: 409 },
  { nombre: "días inconsistentes", solicitud: { DiasSolicitados: 13 }, status: 409 },
  { nombre: "sin período inicial", periodos: [], status: 409 },
  { nombre: "sin período siguiente", periodos: [periodosBase[0]], status: 409 },
  { nombre: "hueco entre períodos", periodos: [periodosBase[0], { ...periodosBase[1], FechaInicio: fecha("2026-10-20") }], status: 409 },
  { nombre: "más de dos períodos", solicitud: { FechaFin: fecha("2026-11-02"), DiasSolicitados: 19 }, status: 409 },
  { nombre: "primer período cerrado", periodos: [{ ...periodosBase[0], Estado: "CERRADO" }, periodosBase[1]], status: 409 },
  { nombre: "segundo período cerrado", periodos: [periodosBase[0], { ...periodosBase[1], Estado: "CERRADO" }], status: 409 },
]) {
  test(`rechaza ${caso.nombre} antes de insertar cálculos`, async () => {
    const bd = prepararBD(caso);
    await assert.rejects(bd.ejecutar(), { status: caso.status });
    assert.equal(bd.escrituras.length, 0);
  });
}

for (const fallo of ["sinSegundo", "falloSegundo"]) {
  test(`propaga ${fallo} al servicio de RH para revertir ambos registros`, async () => {
    const bd = prepararBD({ [fallo]: true });
    await assert.rejects(bd.ejecutar(), fallo === "sinSegundo" ? { status: 500 } : (error) => error === bd.errorOriginal);
    assert.equal(bd.escrituras.length, 2);
  });
}

test("exige transacción, datos y un actor válido", async () => {
  const bd = prepararBD();
  await assert.rejects(registrarCalculoVacaciones({ SolicitudId: 31 }, null, 7), { status: 500 });
  await assert.rejects(registrarCalculoVacaciones(null, bd.transaction, 7), { status: 500 });
  await assert.rejects(registrarCalculoVacaciones({ SolicitudId: 31 }, bd.transaction, 0), { status: 400 });
  assert.equal(bd.consultas.length, 0);
});
