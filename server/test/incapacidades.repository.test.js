import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
});

const { pool } = await import("../src/shared/config/database.js");
const incapacidadesRepository = await import(
  "../src/modules/incapacidades/incapacidades.repository.js"
);

for (const filasInsertadas of [1, 0]) {
  test(`crear incapacidad con ${filasInsertadas} filas insertadas en el detalle`, async () => {
    const solicitud = { SolicitudId: 42, TipoSolicitud: "INCAPACIDAD", Estado: "PENDIENTE" };
    const datos = {
      colaboradorId: 4, restauranteId: 2, registradoPorUsuarioId: 7,
      motivo: "Reposo", tipoIncapacidadId: 1, numeroDocumento: "CCSS-123",
      fechaInicio: new Date("2026-10-06"), fechaFin: new Date("2026-10-08"),
    };
    const pasos = [];
    const transaction = {
      request() {
        const parametros = {};
        return {
          input(name, _type, value) { parametros[name] = value; return this; },
          async query(query) {
            if (query.includes("INSERT INTO dbo.Solicitudes")) {
              pasos.push("cabecera");
              assert.equal(parametros.tipoSolicitud, "INCAPACIDAD");
              return { recordset: [{ SolicitudId: 42 }] };
            }
            if (query.includes("INSERT INTO dbo.Incapacidades")) {
              pasos.push("detalle");
              assert.match(query, /VALUES\s*\(\s*@solicitudId/);
              assert.equal(parametros.solicitudId, 42);
              assert.equal(parametros.numeroDocumento, datos.numeroDocumento);
              assert.equal(parametros.comprobanteRuta, null);
              assert.equal(parametros.comprobanteNombre, null);
              // Un INSERT sin OUTPUT no devuelve recordset.
              return { rowsAffected: [filasInsertadas] };
            }
            pasos.push("consultar");
            assert.match(query, /INNER JOIN dbo.Incapacidades/);
            assert.equal(parametros.solicitudId, 42);
            return { recordset: [solicitud] };
          },
        };
      },
    };
    if (filasInsertadas === 1) {
      assert.deepEqual(await incapacidadesRepository.createIncapacidad(datos, transaction), solicitud);
      assert.deepEqual(pasos, ["cabecera", "detalle", "consultar"]);
    } else {
      await assert.rejects(incapacidadesRepository.createIncapacidad(datos, transaction), { status: 500 });
      assert.deepEqual(pasos, ["cabecera", "detalle"]);
    }
  });
}

test("lista solo los tipos activos ordenados por nombre", async (t) => {
  const tipos = [
    { TipoIncapacidadId: 2, Nombre: "Enfermedad", Activo: true },
  ];
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    async query(query) {
      assert.match(query, /FROM dbo\.TiposIncapacidad/);
      assert.match(query, /WHERE Activo = 1/);
      assert.match(query, /ORDER BY Nombre/);
      return { recordset: tipos };
    },
  }));

  assert.deepEqual(await incapacidadesRepository.getTiposIncapacidad(), tipos);
});

test("consulta tipo por ID incluyendo tipos inactivos y usando la transacción recibida", async () => {
  const tipo = {
    TipoIncapacidadId: 3,
    EntidadEmisora: "CCSS",
    PorcentajePatronal: 50,
    Activo: false,
  };
  const parametros = {};
  const transaction = {
    request() {
      return {
        input(name, _type, value) {
          parametros[name] = value;
          return this;
        },
        async query(query) {
          assert.match(query, /FROM dbo\.TiposIncapacidad/);
          assert.match(query, /TipoIncapacidadId = @tipoId/);
          assert.doesNotMatch(query, /WHERE[^;]*Activo = 1/);
          return { recordset: [tipo] };
        },
      };
    },
  };

  assert.deepEqual(
    await incapacidadesRepository.getTipoIncapacidadById(3, transaction),
    tipo,
  );
  assert.equal(parametros.tipoId, 3);
});

test("devuelve null si el tipo de incapacidad no existe", async (t) => {
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() {
      return this;
    },
    async query() {
      return { recordset: [] };
    },
  }));

  assert.equal(
    await incapacidadesRepository.getTipoIncapacidadById(999),
    null,
  );
});

test("busca incapacidad por número de documento y devuelve null si no existe", async (t) => {
  let recordset = [
    {
      SolicitudId: 12,
      TipoSolicitud: "INCAPACIDAD",
      NumeroDocumento: "CCSS-123",
    },
  ];
  const parametros = {};

  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input(name, _type, value) {
      parametros[name] = value;
      return this;
    },
    async query(query) {
      assert.match(query, /FROM dbo\.Incapacidades AS i/);
      assert.match(query, /INNER JOIN dbo\.Solicitudes AS s/);
      assert.match(query, /i\.NumeroDocumento = @numeroDocumento/);
      assert.match(query, /s\.TipoSolicitud = 'INCAPACIDAD'/);
      assert.match(query, /SELECT TOP \(1\)/);
      return { recordset };
    },
  }));

  assert.deepEqual(
    await incapacidadesRepository.getIncapacidadByNumeroDocumento("CCSS-123"),
    recordset[0],
  );
  assert.equal(parametros.numeroDocumento, "CCSS-123");

  recordset = [];
  assert.equal(
    await incapacidadesRepository.getIncapacidadByNumeroDocumento("inexistente"),
    null,
  );
  assert.equal(parametros.numeroDocumento, "inexistente");
});
