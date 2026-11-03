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
  pool,
  sql
} = await import("../../src/shared/config/database.js");
const utils = await import("../../src/shared/utils/solicitudUtils.js");
const extras = await import("../../src/modules/extras/horasExtras.service.js");
const permisos = await import("../../src/modules/permisosLaborales/permisosLaborales.service.js");
test("filtros normalizan estado y fechas y rechazan valores inválidos", () => {
  expect(utils.validarFiltrosSolicitudes()).toEqual({
    desde: null,
    hasta: null,
    estado: null
  });
  const fecha = new Date("2026-10-03T00:00:00Z");
  expect(utils.validarFiltrosSolicitudes({
    hasta: "2026-10-03",
    estado: " pendiente "
  })).toEqual({
    desde: fecha,
    hasta: fecha,
    estado: "PENDIENTE"
  });
  for (const filtros of [{
    desde: "2026-02-30"
  }, {
    hasta: "03/10/2026"
  }, {
    desde: "2026-10-04",
    hasta: "2026-10-03"
  }, {
    estado: "OTRO"
  }, {
    estado: " "
  }]) {
    assert.throws(() => utils.validarFiltrosSolicitudes(filtros), {
      status: 400
    });
  }
});
test("resolución normaliza únicamente APROBADA y RECHAZADA y exige pendiente", () => {
  for (const estado of ["APROBADA", "RECHAZADA"]) {
    expect(utils.validarEstadoResolucion(` ${estado.toLowerCase()} `)).toBe(estado);
    assert.throws(() => utils.validarSolicitudPendiente({
      Estado: estado
    }), {
      status: 409,
      message: "Esta solicitud ya fue resuelta"
    });
  }
  for (const estado of ["PENDIENTE", "OTRO", "", null, 123]) {
    assert.throws(() => utils.validarEstadoResolucion(estado), {
      status: 400
    });
  }
  utils.validarSolicitudPendiente({
    Estado: "PENDIENTE"
  });
});
for (const instante of ["2026-10-03T05:59:00Z", "2026-10-03T06:00:00Z", "2026-10-03T09:59:00Z"]) {
  test(`fechas usan calendario de Costa Rica: ${instante}`, () => {
    jest.useFakeTimers({
      now: new Date(instante),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const hoy = instante.includes("05:59") ? "2026-10-02" : "2026-10-03";
    for (const fecha of ["2026-10-01", hoy]) {
      assert.throws(() => utils.validarFechaSolicitudFutura(fecha), {
        status: 400
      });
      assert.throws(() => utils.validarFechaResolucion(new Date(fecha)), {
        status: 400
      });
    }
    expect(utils.validarFechaSolicitudFutura("2026-10-04").toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(utils.validarFechaResolucion(new Date("2026-10-04"))).toBe("2026-10-04");
    assert.throws(() => utils.validarFechaSolicitudFutura("2026-02-30"), {
      status: 400
    });
  });
}
test("acceso propio y restaurante asignado conservan permisos y mensajes", async () => {
  jest.spyOn(pool, "connect").mockImplementation(async () => pool);
  jest.spyOn(pool, "request").mockImplementation(() => ({
    input() {
      return this;
    },
    async query(query) {
      expect(query).toMatch(/FROM Usuarios/);
      return {
        recordset: [{
          RestauranteId: 2
        }]
      };
    }
  }));
  const solicitud = {
    ColaboradorId: 4,
    RestauranteId: 2
  };
  await utils.validarAccesoSolicitud(solicitud, {
    Rol: "COLABORADOR",
    ColaboradorId: "4"
  });
  await assert.rejects(utils.validarAccesoSolicitud(solicitud, {
    Rol: "COLABORADOR",
    ColaboradorId: 5
  }), {
    status: 403,
    message: "Solo podés consultar tus propias solicitudes."
  });
  const gerente = {
    Rol: "GERENTE",
    UsuarioId: 7
  };
  await utils.validarAccesoSolicitud(solicitud, gerente);
  await assert.rejects(utils.validarAccesoSolicitud({
    ...solicitud,
    RestauranteId: 3
  }, gerente), {
    status: 403
  });
  expect(await utils.validarRestauranteSolicitudes(null, gerente)).toBe(2);
  expect(await utils.validarRestauranteSolicitudes(2, gerente)).toBe(2);
  await assert.rejects(utils.validarRestauranteSolicitudes(3, gerente), {
    status: 403
  });
  const admin = {
    Rol: "ADMINISTRADOR"
  };
  await utils.validarAccesoSolicitud(solicitud, admin);
  expect(await utils.validarRestauranteSolicitudes(3, admin)).toBe(3);
  await assert.rejects(utils.validarRestauranteSolicitudes(null, admin), {
    status: 400
  });
});
for (const modulo of [extras, permisos]) {
  const esExtras = modulo === extras;
  test(`${esExtras ? "extras" : "permisos"}: validaciones compartidas antes de escribir`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-03T07:00:00Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const colaborador = {
      Rol: "COLABORADOR",
      UsuarioId: 7,
      ColaboradorId: 4
    };
    const crear = datos => esExtras ? extras.crearSolicitudHorasExtras(colaborador, datos) : permisos.solicitarPermiso(datos, colaborador);
    for (const fechaSolicitada of ["2026-10-03", "2026-02-30"]) {
      await assert.rejects(crear({
        fechaSolicitada,
        minutosSolicitados: 60,
        motivo: "Motivo"
      }), {
        status: 400
      });
    }
    let solicitud = {
      ColaboradorId: 4,
      RestauranteId: 2,
      FechaSolicitada: new Date("2026-10-04"),
      Estado: "APROBADA"
    };
    let vencimientos = 0;
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(() => assert.fail("No debe iniciar transacciones"));
    jest.spyOn(pool, "connect").mockImplementation(async () => pool);
    jest.spyOn(pool, "request").mockImplementation(() => ({
      input() {
        return this;
      },
      async query(query) {
        if (query.includes("UPDATE")) {
          vencimientos++;
          return {
            rowsAffected: [0]
          };
        }
        expect(query).toMatch(/SELECT/);
        return {
          recordset: query.includes("FROM Usuarios") ? [{
            RestauranteId: 2
          }] : [solicitud]
        };
      }
    }));
    const resolver = (estado, usuario = {
      Rol: "GERENTE",
      UsuarioId: 7
    }) => esExtras ? extras.resolverSolicitudHorasExtras(1, {
      estado
    }, usuario) : permisos.resolverPermiso(1, {
      estado
    }, usuario);
    await assert.rejects(resolver("PENDIENTE"), {
      status: 400,
      message: "El estado debe ser APROBADA o RECHAZADA"
    });
    await assert.rejects(resolver("RECHAZADA"), {
      status: 409,
      message: "Esta solicitud ya fue resuelta"
    });
    solicitud.RestauranteId = 3;
    await assert.rejects(resolver("RECHAZADA", {
      Rol: "GERENTE",
      UsuarioId: 7
    }), {
      status: 403,
      message: "Solo podés resolver solicitudes de tu restaurante"
    });
    solicitud = {
      ...solicitud,
      RestauranteId: 2,
      Estado: "PENDIENTE",
      FechaSolicitada: new Date("2026-10-03")
    };
    await assert.rejects(resolver("RECHAZADA"), {
      status: 400,
      message: "La solicitud solo puede resolverse antes de la fecha solicitada"
    });
    const consultar = esExtras ? extras.getSolicitudById : permisos.obtenerPermisoPorId;
    await assert.rejects(consultar(1, {
      ...colaborador,
      ColaboradorId: 5
    }), {
      status: 403
    });
    expect(vencimientos).toBe(0);
    // El rechazo de extras vencidas ahora coordina cabecera y minutos.
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {});
    jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {});
    jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => pool.request());
    expect(await consultar("1", colaborador)).toEqual(solicitud);
    expect(vencimientos).toBe(1);
  });
}
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
