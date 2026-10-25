import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { registrarReconocimientoMaternidad } = await import(
  "../src/modules/incapacidades/services/calculoIncapacidades.services.js"
);

const fecha = (texto) => new Date(`${texto}T00:00:00.000Z`);
const textoFecha = (valor) => valor.toISOString().slice(0, 10);
const milisegundosPorDia = 86_400_000;
const tipoMaternidad = {
  TipoIncapacidadId: 3, Codigo: "MATERNIDAD_CCSS", PorcentajePatronal: 50,
};
const crearPeriodo = (id, desde, hasta, extra = {}) => ({
  PeriodoId: id, FechaInicio: fecha(desde), FechaFin: fecha(hasta),
  FechaLimiteAjustes: fecha("2031-01-01"), Estado: "PROGRAMADO", ...extra,
});
const calendarioOctubre = () => [
  crearPeriodo(1, "2026-10-12", "2026-10-25"),
  crearPeriodo(2, "2026-10-26", "2026-11-08"),
  crearPeriodo(3, "2026-11-09", "2026-11-22"),
];

// Se ejecutan el servicio y sus repositorios reales. Solo se simula el resultado
// de las consultas SQL en la transacción; no se abre una conexión a SQL Server.
function preparar(t, desde, hasta, periodos, opciones = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(opciones.ahora ?? "2026-10-20T18:00:00.000Z") });
  const solicitud = {
    SolicitudId: 41, ColaboradorId: 2018, TipoIncapacidadId: 3,
    Estado: "APROBADA", FechaInicio: fecha(desde), FechaFin: fecha(hasta),
    ...opciones.solicitud,
  };
  const saldo = {
    ColaboradorId: 2018, DiasAcumulados: 6, DiasUtilizados: 1,
    DiasDisponibles: 5, FechaAcumuladaHasta: fecha("2026-01-01"),
  };
  const consultas = [];
  const inserciones = [];
  const eventos = [];
  let consultasPeriodos = 0;
  const transaction = {
    async commit() { assert.fail("Maternidad no debe confirmar la transacción del llamador"); },
    async rollback() { assert.fail("Maternidad no debe revertir la transacción del llamador"); },
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) { parametros[nombre] = valor; return this; },
        async query(sql) {
          consultas.push({ sql, parametros });
          if (sql.includes("INSERT INTO dbo.CalculosIncapacidad")) {
            eventos.push("insert-calculo");
            if (opciones.fallarInsert === inserciones.length + 1) throw new Error("Fallo INSERT simulado");
            if (opciones.sinInsert) return { recordset: [] };
            const registro = {
              CalculoId: inserciones.length + 1, SolicitudId: parametros.solicitudId,
              PeriodoId: parametros.periodoId, MinutosReconocidos: parametros.minutosReconocidos,
              PorcentajePatronalAplicado: parametros.porcentajePatronalAplicado,
            };
            inserciones.push(registro);
            return { recordset: [registro] };
          }
          if (sql.includes("FROM dbo.CalculosIncapacidad")) return { recordset: opciones.calculosExistentes ?? [] };
          if (sql.includes("FROM dbo.Solicitudes AS s")) return { recordset: [solicitud] };
          if (sql.includes("FROM dbo.SaldosVacaciones")) return { recordset: [saldo] };
          if (sql.includes("UPDATE dbo.SaldosVacaciones")) {
            eventos.push("update-saldo");
            saldo.DiasAcumulados = parametros.diasAcumulados;
            saldo.FechaAcumuladaHasta = parametros.fechaAcumuladaHasta;
            saldo.DiasDisponibles = saldo.DiasAcumulados - saldo.DiasUtilizados;
            return { recordset: [{ ...saldo }] };
          }
          if (sql.includes("INSERT INTO dbo.Bitacora")) {
            eventos.push("bitacora");
            return { rowsAffected: [1] };
          }
          if (sql.includes("FROM dbo.AsistenciasDiarias")) return { recordset: [] };
          if (sql.includes("FROM dbo.PeriodosPlanilla")) {
            consultasPeriodos++;
            assert.ok(consultasPeriodos <= periodos.length + 2, "El reparto no debe ciclar ante un calendario incoherente");
            const periodo = opciones.obtenerPeriodo
              ? opciones.obtenerPeriodo(parametros.FechaAsignada, consultasPeriodos)
              : periodos.find((p) => p.FechaInicio <= parametros.FechaAsignada && p.FechaFin >= parametros.FechaAsignada);
            return { recordset: periodo ? [periodo] : [] };
          }
          assert.fail(`Consulta SQL inesperada: ${sql}`);
        },
      };
    },
  };
  return {
    solicitud, transaction, consultas, inserciones, eventos, saldo,
    ejecutar(tipo = tipoMaternidad) {
      return registrarReconocimientoMaternidad(solicitud, tipo, 9, transaction);
    },
  };
}

function comprobarCobertura(resultado, desde, hasta) {
  const fechasContadas = [];
  for (const tramo of resultado.calculos) {
    let dia = fecha(tramo.fechaInicioReconocida);
    const fin = fecha(tramo.fechaFinReconocida);
    while (dia <= fin) {
      fechasContadas.push(textoFecha(dia));
      dia = new Date(dia.getTime() + milisegundosPorDia);
    }
  }
  const diasEsperados = (fecha(hasta) - fecha(desde)) / milisegundosPorDia + 1;
  assert.equal(new Set(fechasContadas).size, diasEsperados, "No se omite ningún día");
  assert.equal(fechasContadas.length, diasEsperados, "No se cuenta ningún día dos veces");
  assert.equal(fechasContadas[0], desde);
  assert.equal(fechasContadas.at(-1), hasta);
  assert.equal(resultado.diasReconocidos, diasEsperados);
  assert.equal(resultado.calculos.reduce((total, c) => total + c.diasReconocidos, 0), diasEsperados);
  assert.equal(resultado.minutosReconocidos, diasEsperados * 240);
}

for (const caso of [
  { nombre: "un solo día", desde: "2026-10-20", hasta: "2026-10-20", dias: [1] },
  { nombre: "varios días dentro de un período", desde: "2026-10-20", hasta: "2026-10-23", dias: [4] },
  { nombre: "inicio exacto de período", desde: "2026-10-12", hasta: "2026-10-20", dias: [9] },
  { nombre: "fin exacto de período", desde: "2026-10-20", hasta: "2026-10-25", dias: [6] },
  { nombre: "día final y día inicial de períodos contiguos", desde: "2026-10-25", hasta: "2026-10-26", dias: [1, 1] },
  { nombre: "un período entero", desde: "2026-10-26", hasta: "2026-11-08", dias: [14] },
  { nombre: "caso acordado del 20 de octubre al 12 de noviembre", desde: "2026-10-20", hasta: "2026-11-12", dias: [6, 14, 4] },
]) {
  test(`maternidad reparte fechas inclusivas: ${caso.nombre}`, async (t) => {
    const periodos = calendarioOctubre();
    const original = structuredClone(periodos);
    const prueba = preparar(t, caso.desde, caso.hasta, periodos);
    const resultado = await prueba.ejecutar();
    assert.deepEqual(resultado.calculos.map((c) => c.diasReconocidos), caso.dias);
    assert.deepEqual(prueba.inserciones.map((c) => c.MinutosReconocidos), caso.dias.map((dias) => dias * 240));
    comprobarCobertura(resultado, caso.desde, caso.hasta);
    assert.deepEqual(periodos, original, "No se cambian fechas ni estados del calendario");
    assert.equal(prueba.eventos.filter((e) => e === "update-saldo").length, 1);
    assert.ok(prueba.consultas.every(({ sql }) => !/INSERT INTO dbo.PeriodosPlanilla|UPDATE dbo.PeriodosPlanilla/.test(sql)));
    if (caso.dias.length === 3) {
      assert.deepEqual(prueba.inserciones.map((c) => c.MinutosReconocidos), [1440, 3360, 960]);
      assert.equal(resultado.diasReconocidos, 24);
      assert.equal(resultado.minutosReconocidos, 5760);
      // El tramo se calcula con las fechas existentes y no se guarda duplicado.
      assert.ok(resultado.calculos.every((c) => c.fechaInicioReconocida && c.fechaFinReconocida));
      const insert = prueba.consultas.find(({ sql }) => sql.includes("INSERT INTO dbo.CalculosIncapacidad"));
      assert.doesNotMatch(insert.sql, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
      assert.deepEqual(resultado.calculos.map((c) => c.diasReconocidos), [6, 14, 4]);
    }
  });
}

for (const caso of [
  {
    nombre: "cambio de año", desde: "2026-12-30", hasta: "2027-01-02", dias: [2, 2],
    periodos: () => [crearPeriodo(10, "2026-12-20", "2026-12-31"), crearPeriodo(11, "2027-01-01", "2027-01-14")],
  },
  {
    nombre: "febrero bisiesto", desde: "2028-02-28", hasta: "2028-03-01", dias: [2, 1],
    periodos: () => [crearPeriodo(20, "2028-02-15", "2028-02-29"), crearPeriodo(21, "2028-03-01", "2028-03-14")],
  },
  {
    nombre: "febrero no bisiesto", desde: "2027-02-28", hasta: "2027-03-01", dias: [1, 1],
    periodos: () => [crearPeriodo(30, "2027-02-15", "2027-02-28"), crearPeriodo(31, "2027-03-01", "2027-03-14")],
  },
]) {
  test(`maternidad incluye todos los días en ${caso.nombre}`, async (t) => {
    const prueba = preparar(t, caso.desde, caso.hasta, caso.periodos());
    const resultado = await prueba.ejecutar();
    assert.deepEqual(resultado.calculos.map((c) => c.diasReconocidos), caso.dias);
    comprobarCobertura(resultado, caso.desde, caso.hasta);
  });
}

for (const Estado of ["PROGRAMADO", "ABIERTO", "EN_REVISION"]) {
  test(`maternidad acepta período ${Estado} dentro del plazo`, async (t) => {
    const prueba = preparar(t, "2026-10-20", "2026-10-20", [
      crearPeriodo(1, "2026-10-12", "2026-10-25", { Estado, FechaLimiteAjustes: fecha("2026-10-28") }),
    ]);
    const resultado = await prueba.ejecutar();
    assert.equal(resultado.minutosReconocidos, 240);
    assert.equal(prueba.inserciones.length, 1);
  });
}

for (const Estado of ["CERRADO", "PAGADO", "DESCONOCIDO"]) {
  test(`maternidad bloquea período ${Estado} aunque su plazo no haya vencido`, async (t) => {
    const prueba = preparar(t, "2026-10-20", "2026-10-20", [
      crearPeriodo(1, "2026-10-12", "2026-10-25", { Estado }),
    ]);
    await assert.rejects(prueba.ejecutar(), { status: 409 });
    assert.deepEqual(prueba.eventos, []);
  });
}

for (const [ahora, permitido] of [
  ["2026-10-29T05:59:59.000Z", true],
  ["2026-10-29T06:00:00.000Z", false],
]) {
  test(`plazo de maternidad usa fecha calendario CR: ${ahora}`, async (t) => {
    const prueba = preparar(t, "2026-10-20", "2026-10-20", [
      crearPeriodo(1, "2026-10-12", "2026-10-25", { Estado: "EN_REVISION", FechaLimiteAjustes: fecha("2026-10-28") }),
    ], { ahora });
    if (permitido) assert.equal((await prueba.ejecutar()).minutosReconocidos, 240);
    else {
      await assert.rejects(prueba.ejecutar(), { status: 409 });
      assert.deepEqual(prueba.eventos, []);
    }
  });
}

test("maternidad no omite silenciosamente el hueco de un calendario", async (t) => {
  const prueba = preparar(t, "2026-10-20", "2026-11-12", [calendarioOctubre()[0], calendarioOctubre()[2]]);
  await assert.rejects(prueba.ejecutar(), { status: 409 });
  assert.equal(prueba.inserciones.length, 1);
  assert.deepEqual(prueba.eventos, ["insert-calculo"]);
});

test("maternidad propaga el fallo en el segundo INSERT sin actualizar saldo ni finalizar la transacción", async (t) => {
  const prueba = preparar(t, "2026-10-20", "2026-11-12", calendarioOctubre(), { fallarInsert: 2 });
  await assert.rejects(prueba.ejecutar(), /Fallo INSERT simulado/);
  assert.equal(prueba.inserciones.length, 1);
  assert.deepEqual(prueba.eventos, ["insert-calculo", "insert-calculo"]);
});

test("maternidad detecta un INSERT sin fila devuelta", async (t) => {
  const prueba = preparar(t, "2026-10-20", "2026-10-20", calendarioOctubre(), { sinInsert: true });
  await assert.rejects(prueba.ejecutar(), { status: 409 });
  assert.deepEqual(prueba.eventos, ["insert-calculo"]);
});

test("maternidad corta el recorrido si el repositorio repite un período que ya terminó", async (t) => {
  const periodos = calendarioOctubre();
  const prueba = preparar(t, "2026-10-20", "2026-11-12", periodos, { obtenerPeriodo: () => periodos[0] });
  await assert.rejects(prueba.ejecutar(), { status: 500 });
  assert.equal(prueba.inserciones.length, 1);
  assert.deepEqual(prueba.eventos, ["insert-calculo"]);
});

test("maternidad rechaza un período cuyo inicio es posterior al día solicitado", async (t) => {
  const periodo = crearPeriodo(1, "2026-10-21", "2026-10-25");
  const prueba = preparar(t, "2026-10-20", "2026-10-23", [periodo], { obtenerPeriodo: () => periodo });
  await assert.rejects(prueba.ejecutar(), { status: 500 });
  assert.deepEqual(prueba.eventos, []);
});

for (const campo of ["FechaInicio", "FechaFin", "FechaLimiteAjustes"]) {
  test(`maternidad rechaza ${campo} inválida del período sin continuar el reparto`, async (t) => {
    const periodo = crearPeriodo(1, "2026-10-12", "2026-10-25", { [campo]: new Date(Number.NaN) });
    const prueba = preparar(t, "2026-10-20", "2026-10-20", [periodo], { obtenerPeriodo: () => periodo });
    await assert.rejects(prueba.ejecutar(), { status: 500 });
    assert.deepEqual(prueba.eventos, []);
  });
}

for (const campo of ["FechaInicio", "FechaFin"]) {
  test(`maternidad rechaza ${campo} inválida antes de escribir`, async (t) => {
    const prueba = preparar(t, "2026-10-20", "2026-10-23", calendarioOctubre(), {
      solicitud: { [campo]: new Date(Number.NaN) },
    });
    await assert.rejects(prueba.ejecutar(), (error) => Number.isInteger(error.status));
    assert.deepEqual(prueba.eventos, []);
  });
}

test("maternidad rechaza fechas invertidas antes de escribir", async (t) => {
  const prueba = preparar(t, "2026-10-23", "2026-10-20", calendarioOctubre());
  await assert.rejects(prueba.ejecutar(), { status: 409 });
  assert.deepEqual(prueba.eventos, []);
});

for (const porcentaje of [Number.NaN, -1, 101]) {
  test(`maternidad rechaza porcentaje patronal inválido ${porcentaje}`, async (t) => {
    const prueba = preparar(t, "2026-10-20", "2026-10-20", calendarioOctubre());
    await assert.rejects(prueba.ejecutar({ ...tipoMaternidad, PorcentajePatronal: porcentaje }), { status: 500 });
    assert.deepEqual(prueba.eventos, []);
  });
}

test("maternidad no repite un reconocimiento ya registrado", async (t) => {
  const prueba = preparar(t, "2026-10-20", "2026-10-20", calendarioOctubre(), {
    calculosExistentes: [{ CalculoId: 1, SolicitudId: 41, PeriodoId: 1, MinutosReconocidos: 240 }],
  });
  await assert.rejects(prueba.ejecutar(), { status: 409 });
  assert.deepEqual(prueba.eventos, []);
});
