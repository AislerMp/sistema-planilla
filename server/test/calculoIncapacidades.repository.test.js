import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
});

const repository = await import(
  "../src/modules/incapacidades/calculoIncapacidades.repository.js"
);

function crearTransaccion(consultar) {
  return {
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) {
          parametros[nombre] = valor;
          return this;
        },
        query(query) {
          return consultar(query, parametros);
        },
      };
    },
  };
}

for (const calculos of [
  [],
  [
    { CalculoId: 1, SolicitudId: 31, PeriodoId: 10, MinutosReconocidos: 1440 },
    { CalculoId: 2, SolicitudId: 31, PeriodoId: 11, MinutosReconocidos: 3360 },
    { CalculoId: 3, SolicitudId: 31, PeriodoId: 12, MinutosReconocidos: 960 },
  ],
]) {
  test(`consultar por solicitud conserva los ${calculos.length} cálculos como lista`, async () => {
    const transaction = crearTransaccion(async (query, parametros) => {
      assert.equal(parametros.solicitudId, 31);
      assert.match(query, /WHERE SolicitudId = @solicitudId/);
      assert.match(query, /ORDER BY PeriodoId, CalculoId/);
      assert.doesNotMatch(query, /TOP\s*\(/i);
      assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
      return { recordset: calculos };
    });

    assert.deepEqual(
      await repository.getCalculosBySolicitud(31, transaction),
      calculos,
    );
  });
}

test("guardar maternidad usa solo las columnas existentes de CalculosIncapacidad", async () => {
  const datos = {
    solicitudId: 31,
    periodoId: 10,
    minutosReconocidos: 1440,
    porcentajePatronalAplicado: 50,
  };
  const guardado = {
    CalculoId: 1,
    SolicitudId: datos.solicitudId,
    PeriodoId: datos.periodoId,
    MinutosReconocidos: datos.minutosReconocidos,
    PorcentajePatronalAplicado: datos.porcentajePatronalAplicado,
  };
  const transaction = crearTransaccion(async (query, parametros) => {
    assert.deepEqual(parametros, datos);
    assert.match(query, /INSERT INTO dbo\.CalculosIncapacidad/);
    assert.match(query, /INSERTED\.PeriodoId/);
    assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
    assert.match(query, /s\.Estado = 'APROBADA'/);
    return { recordset: [guardado] };
  });

  assert.deepEqual(
    await repository.createCalculoIncapacidad(datos, transaction),
    guardado,
  );
});

test("los cálculos ordinarios siguen usando las columnas existentes", async () => {
  const transaction = crearTransaccion(async (_query, parametros) => {
    assert.deepEqual(Object.keys(parametros).sort(), [
      "minutosReconocidos", "periodoId", "porcentajePatronalAplicado", "solicitudId",
    ].sort());
    return { recordset: [] };
  });

  assert.equal(
    await repository.createCalculoIncapacidad({
      solicitudId: 31,
      periodoId: 10,
      minutosReconocidos: 720,
      porcentajePatronalAplicado: 50,
    }, transaction),
    null,
  );
});

test("ambas consultas usan el esquema original de cálculos", async () => {
  const transaction = crearTransaccion(async (query) => {
    assert.match(query, /MinutosReconocidos/);
    assert.doesNotMatch(query, /FechaInicioReconocida|FechaFinReconocida|DiasReconocidos/);
    return { recordset: [] };
  });

  assert.deepEqual(await repository.getCalculosBySolicitud(31, transaction), []);
  assert.deepEqual(await repository.getCalculosByPeriodo(10, transaction), []);
});

test("crear un cálculo exige una transacción y propaga los errores SQL", async () => {
  await assert.rejects(repository.createCalculoIncapacidad({}, null), { status: 500 });

  const errorSql = new Error("No se pudo insertar el segundo período");
  const transaction = crearTransaccion(async () => { throw errorSql; });
  await assert.rejects(repository.createCalculoIncapacidad({}, transaction), (error) => error === errorSql);
});

