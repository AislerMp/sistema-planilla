import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test"
});
const {
  pool
} = await import("../../src/shared/config/database.js");
const incapacidadesRepository = await import("../../src/modules/incapacidades/incapacidades.repository.js");
for (const filasInsertadas of [1, 0]) {
  test(`crear incapacidad con ${filasInsertadas} filas insertadas en el detalle`, async () => {
    const solicitud = {
      SolicitudId: 42,
      TipoSolicitud: "INCAPACIDAD",
      Estado: "PENDIENTE"
    };
    const datos = {
      colaboradorId: 4,
      restauranteId: 2,
      registradoPorUsuarioId: 7,
      motivo: "Reposo",
      tipoIncapacidadId: 1,
      numeroDocumento: "CCSS-123",
      fechaInicio: new Date("2026-10-06"),
      fechaFin: new Date("2026-10-08")
    };
    const pasos = [];
    const transaction = {
      request() {
        const parametros = {};
        return {
          input(name, _type, value) {
            parametros[name] = value;
            return this;
          },
          async query(query) {
            if (query.includes("INSERT INTO dbo.Solicitudes")) {
              pasos.push("cabecera");
              expect(parametros.tipoSolicitud).toBe("INCAPACIDAD");
              return {
                recordset: [{
                  SolicitudId: 42
                }]
              };
            }
            if (query.includes("INSERT INTO dbo.Incapacidades")) {
              pasos.push("detalle");
              expect(query).toMatch(/VALUES\s*\(\s*@solicitudId/);
              expect(parametros.solicitudId).toBe(42);
              expect(parametros.numeroDocumento).toBe(datos.numeroDocumento);
              expect(parametros.comprobanteRuta).toBe(null);
              expect(parametros.comprobanteNombre).toBe(null);
              // Un INSERT sin OUTPUT no devuelve recordset.
              return {
                rowsAffected: [filasInsertadas]
              };
            }
            pasos.push("consultar");
            expect(query).toMatch(/INNER JOIN dbo.Incapacidades/);
            expect(parametros.solicitudId).toBe(42);
            return {
              recordset: [solicitud]
            };
          }
        };
      }
    };
    if (filasInsertadas === 1) {
      expect(await incapacidadesRepository.createIncapacidad(datos, transaction)).toEqual(solicitud);
      expect(pasos).toEqual(["cabecera", "detalle", "consultar"]);
    } else {
      await assert.rejects(incapacidadesRepository.createIncapacidad(datos, transaction), {
        status: 500
      });
      expect(pasos).toEqual(["cabecera", "detalle"]);
    }
  });
}
test("lista solo los tipos activos ordenados por nombre", async () => {
  const tipos = [{
    TipoIncapacidadId: 2,
    Nombre: "Enfermedad",
    Activo: true
  }];
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    async query(query) {
      expect(query).toMatch(/FROM dbo\.TiposIncapacidad/);
      expect(query).toMatch(/WHERE Activo = 1/);
      expect(query).toMatch(/ORDER BY Nombre/);
      return {
        recordset: tipos
      };
    }
  }));
  expect(await incapacidadesRepository.getTiposIncapacidad()).toEqual(tipos);
});
test("consulta tipo por ID incluyendo tipos inactivos y usando la transacción recibida", async () => {
  const tipo = {
    TipoIncapacidadId: 3,
    EntidadEmisora: "CCSS",
    PorcentajePatronal: 50,
    Activo: false
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
          expect(query).toMatch(/FROM dbo\.TiposIncapacidad/);
          expect(query).toMatch(/TipoIncapacidadId = @tipoId/);
          assert.doesNotMatch(query, /WHERE[^;]*Activo = 1/);
          return {
            recordset: [tipo]
          };
        }
      };
    }
  };
  expect(await incapacidadesRepository.getTipoIncapacidadById(3, transaction)).toEqual(tipo);
  expect(parametros.tipoId).toBe(3);
});
test("devuelve null si el tipo de incapacidad no existe", async () => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query() {
      return {
        recordset: []
      };
    }
  }));
  expect(await incapacidadesRepository.getTipoIncapacidadById(999)).toBe(null);
});
test("busca incapacidad por número de documento y devuelve null si no existe", async () => {
  let recordset = [{
    SolicitudId: 12,
    TipoSolicitud: "INCAPACIDAD",
    NumeroDocumento: "CCSS-123"
  }];
  const parametros = {};
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input(name, _type, value) {
      parametros[name] = value;
      return this;
    },
    async query(query) {
      expect(query).toMatch(/FROM dbo\.Incapacidades AS i/);
      expect(query).toMatch(/INNER JOIN dbo\.Solicitudes AS s/);
      expect(query).toMatch(/i\.NumeroDocumento = @numeroDocumento/);
      expect(query).toMatch(/s\.TipoSolicitud = 'INCAPACIDAD'/);
      expect(query).toMatch(/SELECT TOP \(1\)/);
      return {
        recordset
      };
    }
  }));
  expect(await incapacidadesRepository.getIncapacidadByNumeroDocumento("CCSS-123")).toEqual(recordset[0]);
  expect(parametros.numeroDocumento).toBe("CCSS-123");
  recordset = [];
  expect(await incapacidadesRepository.getIncapacidadByNumeroDocumento("inexistente")).toBe(null);
  expect(parametros.numeroDocumento).toBe("inexistente");
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
