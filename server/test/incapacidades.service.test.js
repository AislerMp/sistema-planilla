import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
});

const { pool, sql } = await import("../src/shared/config/database.js");
const incapacidades = await import(
  "../src/modules/incapacidades/incapacidades.services.js"
);

for (const caso of [
  { estado: "APROBADA", accion: "APROBAR_INCAPACIDAD", calcular: true },
  { estado: "RECHAZADA", accion: "RECHAZAR_INCAPACIDAD", calcular: false },
  {
    estado: "APROBADA",
    accion: "APROBAR_INCAPACIDAD",
    calcular: true,
    fallaBitacora: true,
  },
]) {
  test(
    `resolver incapacidad RH ${caso.fallaBitacora ? "revierte la bitácora fallida" : `registra ${caso.estado.toLowerCase()}`}`,
    async (t) => {
      const eventos = [];
      const errorBitacora = new Error("Error de bitácora");
      const usuario = { UsuarioId: 7, Rol: "RECURSOS_HUMANOS" };
      const solicitud = {
        SolicitudId: 31,
        TipoSolicitud: "INCAPACIDAD",
        ColaboradorId: 4,
        RestauranteId: 2,
        RegistradoPorUsuarioId: 7,
        Estado: "EN_REVISION_RH",
        TipoIncapacidadId: 1,
        FechaInicio: new Date("2026-10-06T00:00:00.000Z"),
        FechaFin: new Date("2026-10-08T00:00:00.000Z"),
      };
      const incapacidadActualizada = {
        SolicitudId: solicitud.SolicitudId,
        TipoSolicitud: solicitud.TipoSolicitud,
        ColaboradorId: solicitud.ColaboradorId,
        RestauranteId: solicitud.RestauranteId,
        RegistradoPorUsuarioId: solicitud.RegistradoPorUsuarioId,
        Estado: caso.estado,
        Observacion: "Revisada",
        RevisadoPorRhId: usuario.UsuarioId,
      };
      const calculoCreado = {
        CalculoId: 93,
        SolicitudId: solicitud.SolicitudId,
        PeriodoId: 5,
        MinutosReconocidos: 1440,
        PorcentajePatronalAplicado: 50,
      };

      t.mock.method(pool, "connect", async () => pool);
      t.mock.method(sql.Transaction.prototype, "begin", async () => {
        eventos.push("begin");
      });
      t.mock.method(sql.Transaction.prototype, "commit", async () => {
        eventos.push("commit");
      });
      t.mock.method(sql.Transaction.prototype, "rollback", async () => {
        eventos.push("rollback");
      });
      t.mock.method(sql.Transaction.prototype, "request", () => ({
        parametros: {},
        input(name, _type, value) {
          this.parametros[name] = value;
          return this;
        },
        async query(query) {
          const parametros = this.parametros;
          if (query.includes("FROM dbo.Solicitudes AS s")) {
            eventos.push("leer-incapacidad");
            return { recordset: [solicitud] };
          }
          if (query.includes("s.ColaboradorId = @colaboradorId")) {
            return { recordset: [solicitud] };
          }
          if (query.includes("FROM dbo.TiposIncapacidad")) {
            eventos.push("leer-tipo");
            return {
              recordset: [
                {
                  TipoIncapacidadId: 1,
                  Codigo: "ENFERMEDAD_CCSS",
                  PorcentajePatronal: 50,
                },
              ],
            };
          }
          if (query.includes("CodigoTipoIncapacidad")) {
            eventos.push("leer-antecedentes");
            return { recordset: [] };
          }
          if (query.includes("@FechaAsignada BETWEEN FechaInicio AND FechaFin")) {
            eventos.push("leer-periodo");
            return { recordset: [{ PeriodoId: 5, Estado: "ABIERTO" }] };
          }
          if (query.includes("FROM dbo.CalculosIncapacidad")) {
            eventos.push("buscar-calculo");
            return { recordset: [] };
          }
          if (query.includes("UPDATE dbo.Solicitudes")) {
            eventos.push("resolver-solicitud");
            assert.equal(parametros.solicitudId, solicitud.SolicitudId);
            assert.equal(parametros.estado, caso.estado);
            assert.equal(parametros.revisadoPorRhId, usuario.UsuarioId);
            return { recordset: [incapacidadActualizada] };
          }
          if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
            eventos.push("crear-calculo");
            assert.equal(parametros.solicitudId, solicitud.SolicitudId);
            return { recordset: [calculoCreado] };
          }

          assert.match(query, /INSERT INTO dbo\.Bitacora/);
          eventos.push("bitacora");
          assert.equal(parametros.UsuarioId, usuario.UsuarioId);
          assert.equal(parametros.Entidad, "SolicitudesIncapacidades");
          assert.equal(parametros.RegistroId, solicitud.SolicitudId);
          assert.equal(parametros.Accion, caso.accion);
          assert.deepEqual(
            JSON.parse(parametros.DatosAnteriores),
            JSON.parse(JSON.stringify(solicitud)),
          );
          const datosNuevos = JSON.parse(parametros.DatosNuevos);
          assert.deepEqual(
            datosNuevos,
            JSON.parse(JSON.stringify({
              ...solicitud,
              ...incapacidadActualizada,
              registroCalculoCreado: caso.calcular ? calculoCreado : null,
            })),
          );
          assert.deepEqual(
            datosNuevos.registroCalculoCreado,
            caso.calcular ? calculoCreado : null,
          );
          if (caso.fallaBitacora) throw errorBitacora;
          return { rowsAffected: [1] };
        },
      }));

      const resolver = incapacidades.resolverIncapacidadRh(
        solicitud.SolicitudId,
        { estado: caso.estado, observacion: " Revisada " },
        usuario,
      );

      if (caso.fallaBitacora) {
        await assert.rejects(resolver, (error) => error === errorBitacora);
        assert.equal(eventos.at(-1), "rollback");
        assert.equal(eventos.includes("commit"), false);
      } else {
        assert.deepEqual(await resolver, {
          incapacidadActualizada,
          registroCalculoCreado: caso.calcular ? calculoCreado : null,
        });
        assert.equal(eventos.at(-1), "commit");
        assert.equal(eventos.includes("crear-calculo"), caso.calcular);
        assert.deepEqual(eventos.slice(-2), ["bitacora", "commit"]);
      }
    },
  );
}

for (const caso of [
  { nombre: "envía a RH sin pedir el ID del revisor", estado: " en_revision_rh " },
  { nombre: "rechaza usando el gerente autenticado", estado: "rechazada", revisorEnviado: 999 },
  { nombre: "revierte si falla la bitácora", fallaBitacora: true },
  { nombre: "detecta una revisión concurrente", sinActualizacion: true, status: 409 },
  { nombre: "rechaza otro restaurante", restauranteId: 3, status: 403 },
  { nombre: "rechaza solicitudes resueltas", estadoActual: "RECHAZADA", status: 409 },
  { nombre: "rechaza solicitudes inexistentes", inexistente: true, status: 404 },
  { nombre: "rechaza estados inválidos", estado: "APROBADA", status: 400 },
  ...["COLABORADOR", "RECURSOS_HUMANOS", "ADMINISTRADOR"].map((rol) => ({
    nombre: `rechaza el rol ${rol}`, rol, status: 403,
  })),
]) {
  test(`revisión del gerente: ${caso.nombre}`, async (t) => {
    const eventos = [];
    const errorBitacora = new Error("Error de bitácora");
    const usuario = { UsuarioId: 7, Rol: caso.rol ?? "GERENTE" };
    const datos = {
      estado: caso.estado ?? "EN_REVISION_RH",
      observacion: "  Revisada  ",
      revisadoPorGerenteId: caso.revisorEnviado,
    };
    const solicitud = {
      SolicitudId: 31,
      TipoSolicitud: "INCAPACIDAD",
      RestauranteId: caso.restauranteId ?? 2,
      Estado: caso.estadoActual ?? "PENDIENTE",
      NumeroDocumento: "CCSS-31",
      ColaboradorId: 4,
    };
    const revisada = {
      SolicitudId: solicitud.SolicitudId,
      TipoSolicitud: solicitud.TipoSolicitud,
      RestauranteId: solicitud.RestauranteId,
      Estado: datos.estado.trim().toUpperCase(),
      RevisadoPorGerenteId: 7,
      Observacion: "Revisada",
    };

    t.mock.method(pool, "connect", async () => pool);
    t.mock.method(pool, "request", () => ({
      input() { return this; },
      async query(query) {
        if (query.includes("INNER JOIN dbo.Incapacidades")) {
          return { recordset: caso.inexistente ? [] : [solicitud] };
        }
        assert.match(query, /FROM Usuarios AS u/);
        return { recordset: [{ RestauranteId: 2 }] };
      },
    }));
    t.mock.method(sql.Transaction.prototype, "begin", async () => {
      eventos.push("begin");
    });
    t.mock.method(sql.Transaction.prototype, "commit", async () => {
      eventos.push("commit");
    });
    t.mock.method(sql.Transaction.prototype, "rollback", async () => {
      eventos.push("rollback");
    });
    t.mock.method(sql.Transaction.prototype, "request", () => ({
      parametros: {},
      input(name, _type, value) {
        this.parametros[name] = value;
        return this;
      },
      async query(query) {
        const parametros = this.parametros;
        if (query.includes("FROM dbo.Solicitudes AS s")) {
          return { recordset: caso.inexistente ? [] : [solicitud] };
        }
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          return { recordset: [{ ColaboradorId: solicitud.ColaboradorId }] };
        }
        if (query.includes("UPDATE dbo.Solicitudes")) {
          eventos.push("actualizar");
          assert.match(query, /AND Estado = 'PENDIENTE'/);
          assert.equal(parametros.solicitudId, 31);
          assert.equal(parametros.revisadoPorGerenteId, usuario.UsuarioId);
          assert.equal(parametros.estado, revisada.Estado);
          assert.equal(parametros.observacion, "Revisada");
          return { recordset: caso.sinActualizacion ? [] : [revisada] };
        }
        assert.match(query, /INSERT INTO dbo\.Bitacora/);
        eventos.push("bitacora");
        assert.equal(parametros.UsuarioId, usuario.UsuarioId);
        assert.equal(parametros.RegistroId, 31);
        assert.equal(parametros.Accion, revisada.Estado === "EN_REVISION_RH"
          ? "APROBAR_REVISION_INCAPACIDAD" : "RECHAZAR_INCAPACIDAD");
        assert.deepEqual(JSON.parse(parametros.DatosAnteriores), solicitud);
        assert.deepEqual(JSON.parse(parametros.DatosNuevos), { ...solicitud, ...revisada });
        if (caso.fallaBitacora) throw errorBitacora;
        return { rowsAffected: [1] };
      },
    }));

    const resultado = incapacidades.revisarIncapacidadGerente("31", datos, usuario);
    if (caso.status || caso.fallaBitacora) {
      await assert.rejects(resultado, (error) => caso.fallaBitacora
        ? error === errorBitacora : error.status === caso.status);
      assert.deepEqual(eventos, caso.fallaBitacora
        ? ["begin", "actualizar", "bitacora", "rollback"]
        : caso.sinActualizacion ? ["begin", "actualizar", "rollback"]
          : caso.restauranteId || caso.estadoActual || caso.inexistente ? ["begin", "rollback"] : []);
    } else {
      assert.deepEqual(await resultado, revisada);
      assert.deepEqual(eventos, ["begin", "actualizar", "bitacora", "commit"]);
    }
  });
}

for (const fallaBitacora of [false, true]) {
  test(
    `solicitar incapacidad ${
      fallaBitacora ? "revierte si falla la bitácora" : "registra bitácora y confirma"
    }`,
    async (t) => {
      const eventos = [];
      const errorBitacora = new Error("Error de bitácora");
      const usuario = {
        UsuarioId: 7,
        ColaboradorId: 4,
        Rol: "COLABORADOR",
      };
      const datos = {
        restauranteId: 2,
        tipoIncapacidadId: 1,
        numeroDocumento: "CCSS-123",
        fechaInicio: "2026-10-06",
        fechaFin: "2026-10-08",
        motivo: "Reposo",
        comprobanteRuta: "incapacidades/ccss-123.pdf",
        comprobanteNombre: "ccss-123.pdf",
      };
      const solicitudCreada = {
        SolicitudId: 31,
        TipoSolicitud: "INCAPACIDAD",
        ColaboradorId: 4,
        RestauranteId: 2,
        RegistradoPorUsuarioId: 7,
        Estado: "PENDIENTE",
        NumeroDocumento: datos.numeroDocumento,
      };

      t.mock.method(pool, "connect", async () => pool);
      t.mock.method(pool, "request", () => ({
        input() {
          return this;
        },
        async query(query) {
          assert.match(query, /FROM Colaboradores WHERE ColaboradorId = @id/);
          return {
            recordset: [{ ColaboradorId: 4, RestauranteId: 2, Activo: true }],
          };
        },
      }));
      t.mock.method(sql.Transaction.prototype, "begin", async () => {
        eventos.push("begin");
      });
      t.mock.method(sql.Transaction.prototype, "commit", async () => {
        eventos.push("commit");
      });
      t.mock.method(sql.Transaction.prototype, "rollback", async () => {
        eventos.push("rollback");
      });
      t.mock.method(sql.Transaction.prototype, "request", () => ({
        parametros: {},
        input(name, _type, value) {
          this.parametros[name] = value;
          return this;
        },
        async query(query) {
          const parametros = this.parametros;
          if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
            eventos.push("bloquear");
            return { recordset: [{ ColaboradorId: 4 }] };
          }
          if (query.includes("FROM dbo.TiposIncapacidad")) {
            eventos.push("tipo");
            return {
              recordset: [{ TipoIncapacidadId: 1, Activo: true }],
            };
          }
          if (query.includes("i.NumeroDocumento = @numeroDocumento")) {
            eventos.push("buscar-documento");
            return { recordset: [] };
          }
          if (query.includes("AND s.Estado IN")) {
            eventos.push("buscar-superposicion");
            return { recordset: [] };
          }
          if (query.includes("INSERT INTO dbo.Solicitudes")) {
            eventos.push("crear-cabecera");
            assert.equal(parametros.tipoSolicitud, "INCAPACIDAD");
            assert.equal(parametros.colaboradorId, usuario.ColaboradorId);
            assert.equal(parametros.registradoPorUsuarioId, usuario.UsuarioId);
            return { recordset: [{ SolicitudId: 31 }] };
          }
          if (query.includes("INSERT INTO dbo.Incapacidades")) {
            eventos.push("crear-detalle");
            assert.equal(parametros.tipoIncapacidadId, datos.tipoIncapacidadId);
            assert.equal(parametros.numeroDocumento, datos.numeroDocumento);
            return { rowsAffected: [1] };
          }
          if (query.includes("INNER JOIN dbo.Incapacidades")) {
            eventos.push("leer-incapacidad");
            return { recordset: [solicitudCreada] };
          }
          assert.match(query, /INSERT INTO dbo\.Bitacora/);
          eventos.push("bitacora");
          assert.equal(parametros.UsuarioId, usuario.UsuarioId);
          assert.equal(parametros.Entidad, "SolicitudesIncapacidades");
          assert.equal(parametros.RegistroId, solicitudCreada.SolicitudId);
          assert.equal(parametros.Accion, "CREAR");
          assert.equal(JSON.parse(parametros.DatosNuevos).SolicitudId, 31);
          if (fallaBitacora) throw errorBitacora;
          return { rowsAffected: [1] };
        },
      }));

      if (fallaBitacora) {
        await assert.rejects(
          incapacidades.solicitarIncapacidad(datos, usuario),
          (error) => error === errorBitacora,
        );
        assert.equal(eventos.at(-1), "rollback");
        assert.equal(eventos.includes("commit"), false);
      } else {
        assert.deepEqual(
          await incapacidades.solicitarIncapacidad(datos, usuario),
          solicitudCreada,
        );
        assert.deepEqual(eventos, [
          "begin",
          "bloquear",
          "tipo",
          "buscar-documento",
          "buscar-superposicion",
          "crear-cabecera",
          "crear-detalle",
          "leer-incapacidad",
          "bitacora",
          "commit",
        ]);
      }
    },
  );
}
