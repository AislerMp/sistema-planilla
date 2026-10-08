import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const utils = await import("../src/shared/utils/solicitudUtils.js");
const extras = await import("../src/modules/extras/horasExtras.service.js");
const permisos = await import("../src/modules/permisosLaborales/permisosLaborales.service.js");

test("filtros normalizan estado y fechas y rechazan valores inválidos", () => {
  assert.deepEqual(utils.validarFiltrosSolicitudes(), { desde: null, hasta: null, estado: null });
  const fecha = new Date("2026-10-03T00:00:00Z");
  assert.deepEqual(utils.validarFiltrosSolicitudes({ hasta: "2026-10-03", estado: " pendiente " }),
    { desde: fecha, hasta: fecha, estado: "PENDIENTE" });
  for (const filtros of [
    { desde: "2026-02-30" }, { hasta: "03/10/2026" },
    { desde: "2026-10-04", hasta: "2026-10-03" }, { estado: "OTRO" }, { estado: " " },
  ]) {
    assert.throws(() => utils.validarFiltrosSolicitudes(filtros), { status: 400 });
  }
});

test("resolución normaliza únicamente APROBADA y RECHAZADA y exige pendiente", () => {
  for (const estado of ["APROBADA", "RECHAZADA"]) {
    assert.equal(utils.validarEstadoResolucion(` ${estado.toLowerCase()} `), estado);
    assert.throws(() => utils.validarSolicitudPendiente({ Estado: estado }),
      { status: 409, message: "Esta solicitud ya fue resuelta" });
  }
  for (const estado of ["PENDIENTE", "OTRO", "", null, 123]) {
    assert.throws(() => utils.validarEstadoResolucion(estado), { status: 400 });
  }
  utils.validarSolicitudPendiente({ Estado: "PENDIENTE" });
});

for (const instante of ["2026-10-03T05:59:00Z", "2026-10-03T06:00:00Z", "2026-10-03T09:59:00Z"]) {
  test(`fechas usan calendario de Costa Rica: ${instante}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(instante) });
    const hoy = instante.includes("05:59") ? "2026-10-02" : "2026-10-03";
    for (const fecha of ["2026-10-01", hoy]) {
      assert.throws(() => utils.validarFechaSolicitudFutura(fecha), { status: 400 });
      assert.throws(() => utils.validarFechaResolucion(new Date(fecha)), { status: 400 });
    }
    assert.equal(utils.validarFechaSolicitudFutura("2026-10-04").toISOString(), "2026-10-04T00:00:00.000Z");
    assert.equal(utils.validarFechaResolucion(new Date("2026-10-04")), "2026-10-04");
    assert.throws(() => utils.validarFechaSolicitudFutura("2026-02-30"), { status: 400 });
  });
}

test("acceso propio y restaurante asignado conservan permisos y mensajes", async (t) => {
  t.mock.method(pool, "connect", async () => pool);
  t.mock.method(pool, "request", () => ({
    input() { return this; },
    async query(query) {
      assert.match(query, /FROM Usuarios/);
      return { recordset: [{ RestauranteId: 2 }] };
    },
  }));
  const solicitud = { ColaboradorId: 4, RestauranteId: 2 };
  await utils.validarAccesoSolicitud(solicitud, { Rol: "COLABORADOR", ColaboradorId: "4" });
  await assert.rejects(utils.validarAccesoSolicitud(solicitud, { Rol: "COLABORADOR", ColaboradorId: 5 }),
    { status: 403, message: "Solo podés consultar tus propias solicitudes." });
  const gerente = { Rol: "GERENTE", UsuarioId: 7 };
  await utils.validarAccesoSolicitud(solicitud, gerente);
  await assert.rejects(utils.validarAccesoSolicitud({ ...solicitud, RestauranteId: 3 }, gerente), { status: 403 });
  assert.equal(await utils.validarRestauranteSolicitudes(null, gerente), 2);
  assert.equal(await utils.validarRestauranteSolicitudes(2, gerente), 2);
  await assert.rejects(utils.validarRestauranteSolicitudes(3, gerente), { status: 403 });
  const admin = { Rol: "ADMINISTRADOR" };
  await utils.validarAccesoSolicitud(solicitud, admin);
  assert.equal(await utils.validarRestauranteSolicitudes(3, admin), 3);
  await assert.rejects(utils.validarRestauranteSolicitudes(null, admin), { status: 400 });
});

for (const modulo of [extras, permisos]) {
  const esExtras = modulo === extras;
  test(`${esExtras ? "extras" : "permisos"}: validaciones compartidas antes de escribir`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-03T07:00:00Z") });
    const colaborador = { Rol: "COLABORADOR", UsuarioId: 7, ColaboradorId: 4 };
    const crear = (datos) => esExtras
      ? extras.crearSolicitudHorasExtras(colaborador, datos)
      : permisos.solicitarPermiso(datos, colaborador);
    for (const fechaSolicitada of ["2026-10-03", "2026-02-30"]) {
      await assert.rejects(crear({ fechaSolicitada, minutosSolicitados: 60, motivo: "Motivo" }), { status: 400 });
    }
    let solicitud = { ColaboradorId: 4, RestauranteId: 2, FechaSolicitada: new Date("2026-10-04"), Estado: "APROBADA" };
    let vencimientos = 0;
    t.mock.method(sql.Transaction.prototype, "begin", () => assert.fail("No debe iniciar transacciones"));
    t.mock.method(pool, "connect", async () => pool);
    t.mock.method(pool, "request", () => ({
      input() { return this; },
      async query(query) {
        if (query.includes("UPDATE")) {
          vencimientos++;
          return { rowsAffected: [0] };
        }
        assert.match(query, /SELECT/);
        return { recordset: query.includes("FROM Usuarios") ? [{ RestauranteId: 2 }] : [solicitud] };
      },
    }));
    const resolver = (estado, usuario = { Rol: "GERENTE", UsuarioId: 7 }) => esExtras
      ? extras.resolverSolicitudHorasExtras(1, { estado }, usuario)
      : permisos.resolverPermiso(1, { estado }, usuario);
    await assert.rejects(resolver("PENDIENTE"), { status: 400, message: "El estado debe ser APROBADA o RECHAZADA" });
    await assert.rejects(resolver("RECHAZADA"), { status: 409, message: "Esta solicitud ya fue resuelta" });
    solicitud.RestauranteId = 3;
    await assert.rejects(resolver("RECHAZADA", { Rol: "GERENTE", UsuarioId: 7 }),
      { status: 403, message: "Solo podés resolver solicitudes de tu restaurante" });
    solicitud = { ...solicitud, RestauranteId: 2, Estado: "PENDIENTE", FechaSolicitada: new Date("2026-10-03") };
    await assert.rejects(resolver("RECHAZADA"),
      { status: 400, message: "La solicitud solo puede resolverse antes de la fecha solicitada" });
    const consultar = esExtras ? extras.getSolicitudById : permisos.obtenerPermisoPorId;
    await assert.rejects(consultar(1, { ...colaborador, ColaboradorId: 5 }), { status: 403 });
    assert.equal(vencimientos, 0);
    // El rechazo de extras vencidas ahora coordina cabecera y minutos.
    t.mock.method(sql.Transaction.prototype, "begin", async () => {});
    t.mock.method(sql.Transaction.prototype, "commit", async () => {});
    t.mock.method(sql.Transaction.prototype, "request", () => pool.request());
    assert.deepEqual(await consultar("1", colaborador), solicitud);
    assert.equal(vencimientos, 1);
  });
}
