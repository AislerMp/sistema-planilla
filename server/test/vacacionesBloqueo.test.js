import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { pool, sql } = await import("../src/shared/config/database.js");
const { validarDiasVacaciones } = await import("../src/modules/vacaciones/services/vacaciones.service.js");
const marcas = await import("../src/modules/marcas/marcas.service.js");
const asistencias = await import("../src/modules/asistenciasDiarias/asistenciasDiarias.service.js");
const extras = await import("../src/modules/extras/horasExtras.service.js");
const permisos = await import("../src/modules/permisosLaborales/permisosLaborales.service.js");
const incapacidades = await import("../src/modules/incapacidades/incapacidades.services.js");
const fecha = (texto) => new Date(`${texto}T00:00:00.000Z`);

for (const caso of [
  { desde: "2026-10-15", hasta: "2026-10-15", bloquea: true },
  { desde: "2026-10-18", hasta: "2026-10-18", bloquea: true },
  { desde: "2026-10-10", hasta: "2026-10-20", bloquea: true },
  { desde: "2026-10-16", hasta: "2026-10-17", bloquea: true },
  { desde: "2026-10-01", hasta: "2026-10-14", bloquea: false },
  { desde: "2026-10-19", hasta: "2026-10-20", bloquea: false },
  { desde: "2026-10-15", hasta: "2026-10-18", estado: "PENDIENTE", bloquea: false },
  { desde: "2026-10-15", hasta: "2026-10-18", estado: "EN_REVISION_RH", bloquea: false },
  { desde: "2026-10-15", hasta: "2026-10-18", estado: "RECHAZADA", bloquea: false },
]) {
  test(`rango ${caso.desde} a ${caso.hasta}, vacaciones ${caso.estado ?? "APROBADA"}`, async () => {
    const transaction = { request() {
      const p = {};
      return {
        input(nombre, _tipo, valor) { p[nombre] = valor; return this; },
        async query(query) {
          assert.match(query, /s.TipoSolicitud = 'VACACIONES'/);
          assert.match(query, /v.FechaInicio <= @fechaFin/);
          assert.match(query, /v.FechaFin >= @fechaInicio/);
          assert.equal(p.colaboradorId, 4);
          assert.equal(p.fechaInicio.toISOString().slice(0, 10), caso.desde);
          assert.equal(p.fechaFin.toISOString().slice(0, 10), caso.hasta);
          return { recordset: fecha("2026-10-15") <= p.fechaFin && fecha("2026-10-18") >= p.fechaInicio
            ? [{ SolicitudId: 31, Estado: caso.estado ?? "APROBADA" }] : [] };
        },
      };
    } };
    const ejecutar = () => validarDiasVacaciones("4", caso.desde, fecha(caso.hasta), transaction);
    if (caso.bloquea) await assert.rejects(ejecutar(), { status: 409 });
    else await ejecutar();
  });
}

test("la validación del servicio rechaza datos inválidos sin SQL", async () => {
  const transaction = { request() { assert.fail("No debe consultar con datos inválidos"); } };
  await assert.rejects(validarDiasVacaciones(4, "2026-10-15", null, null), { status: 500 });
  for (const args of [
    [0, "2026-10-15", null], [4, "2026-02-30", null],
    [4, "2026-10-18", "2026-10-15"], [4, new Date("inválida"), null],
  ]) await assert.rejects(validarDiasVacaciones(...args, transaction), { status: 400 });
});

for (const operacion of ["entrada", "salida", "asistencia", "ajustar extras", "solicitar permiso", "solicitar extras", "solicitar incapacidad", "aprobar permiso", "aprobar extras", "aprobar incapacidad"]) {
  test(`${operacion} se bloquea por vacaciones antes de escribir y revierte`, async (t) => {
    // A las 02:00 de Costa Rica, las marcas todavía pertenecen al día 6.
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T08:00:00Z") });
    const eventos = [];
    const usuario = { UsuarioId: 7, ColaboradorId: 4, Rol: "COLABORADOR" };
    const gerente = { UsuarioId: 8, Rol: "GERENTE" };
    const solicitud = { SolicitudId: 31, ColaboradorId: 4, RestauranteId: 2, Estado: "PENDIENTE", FechaSolicitada: fecha("2099-06-15"), MinutosSolicitados: 120 };
    const incapacidad = { ...solicitud, Estado: "EN_REVISION_RH", FechaInicio: fecha("2026-10-06"), FechaFin: fecha("2026-10-08") };
    let transaction;
    t.mock.method(console, "error", () => {});
    t.mock.method(pool, "connect", async () => pool);
    const request = (actual = null) => {
      const p = {};
      return {
        input(nombre, _tipo, valor) { p[nombre] = valor; return this; },
        async query(query) {
          assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE)\b/);
          if (query.includes("FROM dbo.Vacaciones")) {
            assert.equal(actual, transaction);
            assert.equal(p.colaboradorId, 4);
            const dia = operacion.includes("permiso") || operacion.includes("solicitar extras") || operacion === "aprobar extras" ? "2099-06-15" : "2026-10-06";
            assert.equal(p.fechaInicio.toISOString().slice(0, 10), dia);
            assert.equal(p.fechaFin.toISOString().slice(0, 10), operacion.includes("incapacidad") ? "2026-10-08" : dia);
            eventos.push("vacaciones");
            return { recordset: [{ SolicitudId: 40, Estado: "APROBADA" }] };
          }
          if (query.includes("FROM dbo.Colaboradores") && query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
            assert.equal(actual, transaction);
            eventos.push("bloquear");
            return { recordset: [{ ColaboradorId: 4 }] };
          }
          if (query.includes("FROM Usuarios")) return { recordset: [{ RestauranteId: 2 }] };
          if (query.includes("FROM Colaboradores")) return { recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }] };
          if (query.includes("FROM dbo.PeriodosPlanilla")) return { recordset: [{ PeriodoId: 1, Estado: "ABIERTO", FechaLimiteAjustes: fecha("2099-12-31") }] };
          if (query.includes("FROM dbo.MarcasAsistencia")) return { recordset: operacion === "salida" ? [{ MarcaId: 10, FechaHoraEntrada: new Date("2026-10-07T01:00:00Z") }] : [] };
          if (query.includes("FROM dbo.AsistenciasDiarias")) return { recordset: [{ AsistenciaId: 3, ColaboradorId: 4, RestauranteId: 2, PeriodoId: 1, FechaAsignada: fecha("2026-10-06"), MinutosEfectivos: 480 }] };
          if (query.includes("FROM dbo.PermisosLaborales")) return { recordset: operacion === "aprobar permiso" ? [solicitud] : [] };
          if (query.includes("FROM dbo.SolicitudesHorasExtras")) return { recordset: operacion === "aprobar extras" ? [solicitud] : [] };
          if (query.includes("FROM dbo.TiposIncapacidad")) return { recordset: [{ TipoIncapacidadId: 1, Activo: true }] };
          if (query.includes("FROM dbo.Solicitudes AS s")) return { recordset: [incapacidad] };
          if (query.includes("FROM dbo.Incapacidades")) return { recordset: [] };
          assert.fail(`Consulta inesperada: ${query}`);
        },
      };
    };
    t.mock.method(pool, "request", () => request());
    t.mock.method(sql.Transaction.prototype, "request", function () { return request(this); });
    t.mock.method(sql.Transaction.prototype, "begin", async function () { transaction = this; eventos.push("begin"); });
    t.mock.method(sql.Transaction.prototype, "commit", async () => eventos.push("commit"));
    t.mock.method(sql.Transaction.prototype, "rollback", async () => eventos.push("rollback"));
    const operaciones = {
      entrada: () => marcas.registrarEntrada(usuario), salida: () => marcas.registrarSalida(usuario),
      asistencia: () => asistencias.ajustarMinutosAsistencia(3, 480, "Corrección", gerente),
      "ajustar extras": () => extras.actualizarHorasExtra(3, 60, "Corrección", gerente),
      "solicitar permiso": () => permisos.solicitarPermiso({ fechaSolicitada: "2099-06-15", motivo: "Trámite" }, usuario),
      "solicitar extras": () => extras.crearSolicitudHorasExtras(usuario, { fechaSolicitada: "2099-06-15", motivo: "Apoyo", minutosSolicitados: 60 }),
      "solicitar incapacidad": () => incapacidades.solicitarIncapacidad({ restauranteId: 2, tipoIncapacidadId: 1, numeroDocumento: "CCSS-123", fechaInicio: "2026-10-06", fechaFin: "2026-10-08", comprobanteRuta: "incapacidades/prueba.pdf", comprobanteNombre: "prueba.pdf" }, usuario),
      "aprobar permiso": () => permisos.resolverPermiso(31, { estado: "APROBADA" }, gerente),
      "aprobar extras": () => extras.resolverSolicitudHorasExtras(31, { estado: "APROBADA", minutosAutorizados: 60 }, gerente),
      "aprobar incapacidad": () => incapacidades.resolverIncapacidadRh(31, { estado: "APROBADA" }, { UsuarioId: 9, Rol: "RECURSOS_HUMANOS" }),
    };
    await assert.rejects(operaciones[operacion](), (error) => {
      assert.equal(error.status, 409, error.message);
      assert.match(error.message, /vacaciones aprobadas/);
      return true;
    });
    assert.deepEqual(eventos, ["begin", "bloquear", "vacaciones", "rollback"]);
  });
}
