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
          assert.equal(parametros.Entidad, "Solicitudes");
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
