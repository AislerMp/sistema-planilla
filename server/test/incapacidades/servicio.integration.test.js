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
const incapacidades = await import("../../src/modules/incapacidades/services/incapacidades.services.js");
for (const caso of [{
  estado: "APROBADA",
  accion: "APROBAR_INCAPACIDAD",
  calcular: true
}, {
  estado: "APROBADA",
  accion: "APROBAR_INCAPACIDAD",
  calcular: true,
  codigo: "RIESGO_TRABAJO_INS",
  porcentaje: 0,
  minutos: 0
}, {
  estado: "APROBADA",
  accion: "APROBAR_INCAPACIDAD",
  calcular: true,
  estadoPeriodo: "EN_REVISION",
  periodoPermitido: true
}, {
  estado: "RECHAZADA",
  accion: "RECHAZAR_INCAPACIDAD",
  calcular: false
}, ...["PROGRAMADO", "CERRADO", "PAGADO"].map(estadoPeriodo => ({
  estado: "APROBADA",
  accion: "APROBAR_INCAPACIDAD",
  calcular: true,
  estadoPeriodo
})), {
  estado: "APROBADA",
  accion: "APROBAR_INCAPACIDAD",
  calcular: true,
  fallaBitacora: true
}]) {
  test(`resolver incapacidad RH ${caso.estadoPeriodo ? `${caso.periodoPermitido ? "acepta" : "rechaza"} cálculo en período ${caso.estadoPeriodo}` : caso.fallaBitacora ? "revierte la bitácora fallida" : `registra ${caso.estado.toLowerCase()} ${caso.codigo ?? "ENFERMEDAD_CCSS"}`}`, async () => {
    jest.useFakeTimers({
      now: new Date("2026-10-12T09:59:59Z"),
      doNotFake: ["performance", "hrtime", "nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
    });
    const eventos = [];
    const errorBitacora = new Error("Error de bitácora");
    const usuario = {
      UsuarioId: 7,
      Rol: "RECURSOS_HUMANOS"
    };
    const solicitud = {
      SolicitudId: 31,
      TipoSolicitud: "INCAPACIDAD",
      ColaboradorId: 4,
      RestauranteId: 2,
      RegistradoPorUsuarioId: 7,
      Estado: "EN_REVISION_RH",
      TipoIncapacidadId: 1,
      FechaInicio: new Date("2026-10-06T00:00:00.000Z"),
      FechaFin: new Date("2026-10-08T00:00:00.000Z")
    };
    const incapacidadActualizada = {
      SolicitudId: solicitud.SolicitudId,
      TipoSolicitud: solicitud.TipoSolicitud,
      ColaboradorId: solicitud.ColaboradorId,
      RestauranteId: solicitud.RestauranteId,
      RegistradoPorUsuarioId: solicitud.RegistradoPorUsuarioId,
      Estado: caso.estado,
      Observacion: "Revisada",
      RevisadoPorRhId: usuario.UsuarioId
    };
    let solicitudAlmacenada = solicitud;
    const calculoCreado = {
      CalculoId: 93,
      SolicitudId: solicitud.SolicitudId,
      PeriodoId: 5,
      MinutosReconocidos: caso.minutos ?? 720,
      PorcentajePatronalAplicado: caso.porcentaje ?? 50
    };
    jest.spyOn(pool, "connect").mockImplementation(async () => pool);
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {
      eventos.push("begin");
    });
    jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {
      eventos.push("commit");
    });
    jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {
      eventos.push("rollback");
    });
    jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => ({
      parametros: {},
      input(name, _type, value) {
        this.parametros[name] = value;
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        if (query.includes("FROM dbo.Colaboradores") && query.includes("WITH (UPDLOCK, HOLDLOCK)")) return {
          recordset: [{
            ColaboradorId: 4
          }]
        };
        const parametros = this.parametros;
        if (query.includes("FROM dbo.Solicitudes AS s")) {
          eventos.push("leer-incapacidad");
          return {
            recordset: [solicitudAlmacenada]
          };
        }
        if (query.includes("s.ColaboradorId = @colaboradorId")) {
          return {
            recordset: [solicitud]
          };
        }
        if (query.includes("FROM dbo.TiposIncapacidad")) {
          eventos.push("leer-tipo");
          return {
            recordset: [{
              TipoIncapacidadId: 1,
              Codigo: caso.codigo ?? "ENFERMEDAD_CCSS",
              PorcentajePatronal: caso.porcentaje ?? 50
            }]
          };
        }
        if (query.includes("CodigoTipoIncapacidad")) {
          eventos.push("leer-antecedentes");
          return {
            recordset: []
          };
        }
        if (query.includes("@FechaAsignada BETWEEN FechaInicio AND FechaFin")) {
          eventos.push("leer-periodo");
          expect(parametros.FechaAsignada.toISOString().slice(0, 10)).toBe("2026-10-11");
          return {
            recordset: [{
              PeriodoId: 5,
              Estado: caso.estadoPeriodo ?? "ABIERTO"
            }]
          };
        }
        if (query.includes("FROM dbo.CalculosIncapacidad")) {
          eventos.push("buscar-calculo");
          return {
            recordset: []
          };
        }
        if (query.includes("FROM dbo.AsistenciasDiarias")) return {
          recordset: []
        };
        if (query.includes("UPDATE dbo.Solicitudes")) {
          eventos.push("resolver-solicitud");
          expect(parametros.solicitudId).toBe(solicitud.SolicitudId);
          expect(parametros.estado).toBe(caso.estado);
          expect(parametros.revisadoPorRhId).toBe(usuario.UsuarioId);
          solicitudAlmacenada = {
            ...solicitud,
            ...incapacidadActualizada
          };
          return {
            recordset: [incapacidadActualizada]
          };
        }
        if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
          eventos.push("crear-calculo");
          expect(parametros.solicitudId).toBe(solicitud.SolicitudId);
          expect(parametros.minutosReconocidos).toBe(calculoCreado.MinutosReconocidos);
          expect(parametros.porcentajePatronalAplicado).toBe(calculoCreado.PorcentajePatronalAplicado);
          return {
            recordset: [calculoCreado]
          };
        }
        expect(query).toMatch(/INSERT INTO dbo\.Bitacora/);
        eventos.push("bitacora");
        expect(parametros.UsuarioId).toBe(usuario.UsuarioId);
        expect(parametros.Entidad).toBe("SolicitudesIncapacidades");
        expect(parametros.RegistroId).toBe(solicitud.SolicitudId);
        expect(parametros.Accion).toBe(caso.accion);
        expect(JSON.parse(parametros.DatosAnteriores)).toEqual(JSON.parse(JSON.stringify(solicitud)));
        const datosNuevos = JSON.parse(parametros.DatosNuevos);
        expect(datosNuevos).toEqual(JSON.parse(JSON.stringify({
          ...solicitud,
          ...incapacidadActualizada,
          registroCalculoCreado: caso.calcular ? calculoCreado : null
        })));
        expect(datosNuevos.registroCalculoCreado).toEqual(caso.calcular ? calculoCreado : null);
        if (caso.fallaBitacora) throw errorBitacora;
        return {
          rowsAffected: [1]
        };
      }
    }));
    const resolver = incapacidades.resolverIncapacidadRh(solicitud.SolicitudId, {
      estado: caso.estado,
      observacion: " Revisada "
    }, usuario);
    if (caso.estadoPeriodo && !caso.periodoPermitido) {
      await assert.rejects(resolver, {
        status: 409
      });
      expect(eventos.at(-1)).toBe("rollback");
      expect(eventos.includes("crear-calculo")).toBe(false);
      expect(eventos.includes("bitacora")).toBe(false);
      expect(eventos.includes("commit")).toBe(false);
    } else if (caso.fallaBitacora) {
      await assert.rejects(resolver, error => error === errorBitacora);
      expect(eventos.at(-1)).toBe("rollback");
      expect(eventos.includes("commit")).toBe(false);
    } else {
      expect(await resolver).toEqual({
        incapacidadActualizada,
        registroCalculoCreado: caso.calcular ? calculoCreado : null
      });
      expect(eventos.at(-1)).toBe("commit");
      expect(eventos.includes("crear-calculo")).toBe(caso.calcular);
      expect(eventos.slice(-2)).toEqual(["bitacora", "commit"]);
    }
  });
}
for (const caso of [{
  nombre: "envía a RH sin pedir el ID del revisor",
  estado: " en_revision_rh "
}, {
  nombre: "rechaza usando el gerente autenticado",
  estado: "rechazada",
  revisorEnviado: 999
}, {
  nombre: "revierte si falla la bitácora",
  fallaBitacora: true
}, {
  nombre: "detecta una revisión concurrente",
  sinActualizacion: true,
  status: 409
}, {
  nombre: "rechaza otro restaurante",
  restauranteId: 3,
  status: 403
}, {
  nombre: "rechaza solicitudes resueltas",
  estadoActual: "RECHAZADA",
  status: 409
}, {
  nombre: "rechaza solicitudes inexistentes",
  inexistente: true,
  status: 404
}, {
  nombre: "rechaza estados inválidos",
  estado: "APROBADA",
  status: 400
}, ...["COLABORADOR", "RECURSOS_HUMANOS", "ADMINISTRADOR"].map(rol => ({
  nombre: `rechaza el rol ${rol}`,
  rol,
  status: 403
}))]) {
  test(`revisión del gerente: ${caso.nombre}`, async () => {
    const eventos = [];
    const errorBitacora = new Error("Error de bitácora");
    const usuario = {
      UsuarioId: 7,
      Rol: caso.rol ?? "GERENTE"
    };
    const datos = {
      estado: caso.estado ?? "EN_REVISION_RH",
      observacion: "  Revisada  ",
      revisadoPorGerenteId: caso.revisorEnviado
    };
    const solicitud = {
      SolicitudId: 31,
      TipoSolicitud: "INCAPACIDAD",
      RestauranteId: caso.restauranteId ?? 2,
      Estado: caso.estadoActual ?? "PENDIENTE",
      NumeroDocumento: "CCSS-31",
      ColaboradorId: 4
    };
    const revisada = {
      SolicitudId: solicitud.SolicitudId,
      TipoSolicitud: solicitud.TipoSolicitud,
      RestauranteId: solicitud.RestauranteId,
      Estado: datos.estado.trim().toUpperCase(),
      RevisadoPorGerenteId: 7,
      Observacion: "Revisada"
    };
    jest.spyOn(pool, "connect").mockImplementation(async () => pool);
    jest.spyOn(pool, "request").mockImplementation(() => ({
      input() {
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        if (query.includes("INNER JOIN dbo.Incapacidades")) {
          return {
            recordset: caso.inexistente ? [] : [solicitud]
          };
        }
        expect(query).toMatch(/FROM Usuarios AS u/);
        return {
          recordset: [{
            RestauranteId: 2
          }]
        };
      }
    }));
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {
      eventos.push("begin");
    });
    jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {
      eventos.push("commit");
    });
    jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {
      eventos.push("rollback");
    });
    jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => ({
      parametros: {},
      input(name, _type, value) {
        this.parametros[name] = value;
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        const parametros = this.parametros;
        if (query.includes("FROM dbo.Solicitudes AS s")) {
          return {
            recordset: caso.inexistente ? [] : [solicitud]
          };
        }
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          return {
            recordset: [{
              ColaboradorId: solicitud.ColaboradorId
            }]
          };
        }
        if (query.includes("UPDATE dbo.Solicitudes")) {
          eventos.push("actualizar");
          expect(query).toMatch(/AND Estado = 'PENDIENTE'/);
          expect(parametros.solicitudId).toBe(31);
          expect(parametros.revisadoPorGerenteId).toBe(usuario.UsuarioId);
          expect(parametros.estado).toBe(revisada.Estado);
          expect(parametros.observacion).toBe("Revisada");
          return {
            recordset: caso.sinActualizacion ? [] : [revisada]
          };
        }
        expect(query).toMatch(/INSERT INTO dbo\.Bitacora/);
        eventos.push("bitacora");
        expect(parametros.UsuarioId).toBe(usuario.UsuarioId);
        expect(parametros.RegistroId).toBe(31);
        expect(parametros.Accion).toBe(revisada.Estado === "EN_REVISION_RH" ? "APROBAR_REVISION_INCAPACIDAD" : "RECHAZAR_INCAPACIDAD");
        expect(JSON.parse(parametros.DatosAnteriores)).toEqual(solicitud);
        expect(JSON.parse(parametros.DatosNuevos)).toEqual({
          ...solicitud,
          ...revisada
        });
        if (caso.fallaBitacora) throw errorBitacora;
        return {
          rowsAffected: [1]
        };
      }
    }));
    const resultado = incapacidades.revisarIncapacidadGerente("31", datos, usuario);
    if (caso.status || caso.fallaBitacora) {
      await assert.rejects(resultado, error => caso.fallaBitacora ? error === errorBitacora : error.status === caso.status);
      expect(eventos).toEqual(caso.fallaBitacora ? ["begin", "actualizar", "bitacora", "rollback"] : caso.sinActualizacion ? ["begin", "actualizar", "rollback"] : caso.restauranteId || caso.estadoActual || caso.inexistente ? ["begin", "rollback"] : []);
    } else {
      expect(await resultado).toEqual(revisada);
      expect(eventos).toEqual(["begin", "actualizar", "bitacora", "commit"]);
    }
  });
}
for (const fallaBitacora of [false, true]) {
  test(`solicitar incapacidad ${fallaBitacora ? "revierte si falla la bitácora" : "registra bitácora y confirma"}`, async () => {
    const eventos = [];
    const errorBitacora = new Error("Error de bitácora");
    const usuario = {
      UsuarioId: 7,
      ColaboradorId: 4,
      Rol: "COLABORADOR"
    };
    const datos = {
      restauranteId: 2,
      tipoIncapacidadId: 1,
      numeroDocumento: "CCSS-123",
      fechaInicio: "2026-10-06",
      fechaFin: "2026-10-08",
      motivo: "Reposo",
      comprobanteRuta: "incapacidades/ccss-123.pdf",
      comprobanteNombre: "ccss-123.pdf"
    };
    const solicitudCreada = {
      SolicitudId: 31,
      TipoSolicitud: "INCAPACIDAD",
      ColaboradorId: 4,
      RestauranteId: 2,
      RegistradoPorUsuarioId: 7,
      Estado: "PENDIENTE",
      NumeroDocumento: datos.numeroDocumento
    };
    jest.spyOn(pool, "connect").mockImplementation(async () => pool);
    jest.spyOn(pool, "request").mockImplementation(() => ({
      input() {
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        expect(query).toMatch(/FROM Colaboradores WHERE ColaboradorId = @id/);
        return {
          recordset: [{
            ColaboradorId: 4,
            RestauranteId: 2,
            Activo: true
          }]
        };
      }
    }));
    jest.spyOn(sql.Transaction.prototype, "begin").mockImplementation(async () => {
      eventos.push("begin");
    });
    jest.spyOn(sql.Transaction.prototype, "commit").mockImplementation(async () => {
      eventos.push("commit");
    });
    jest.spyOn(sql.Transaction.prototype, "rollback").mockImplementation(async () => {
      eventos.push("rollback");
    });
    jest.spyOn(sql.Transaction.prototype, "request").mockImplementation(() => ({
      parametros: {},
      input(name, _type, value) {
        this.parametros[name] = value;
        return this;
      },
      async query(query) {
        // Estos escenarios previos no tienen vacaciones superpuestas.
        if (query.includes("FROM dbo.Vacaciones")) return {
          recordset: []
        };
        const parametros = this.parametros;
        if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
          eventos.push("bloquear");
          return {
            recordset: [{
              ColaboradorId: 4
            }]
          };
        }
        if (query.includes("FROM dbo.TiposIncapacidad")) {
          eventos.push("tipo");
          return {
            recordset: [{
              TipoIncapacidadId: 1,
              Activo: true
            }]
          };
        }
        if (query.includes("i.NumeroDocumento = @numeroDocumento")) {
          eventos.push("buscar-documento");
          return {
            recordset: []
          };
        }
        if (query.includes("AND s.Estado IN")) {
          eventos.push("buscar-superposicion");
          return {
            recordset: []
          };
        }
        if (query.includes("INSERT INTO dbo.Solicitudes")) {
          eventos.push("crear-cabecera");
          expect(parametros.tipoSolicitud).toBe("INCAPACIDAD");
          expect(parametros.colaboradorId).toBe(usuario.ColaboradorId);
          expect(parametros.registradoPorUsuarioId).toBe(usuario.UsuarioId);
          return {
            recordset: [{
              SolicitudId: 31
            }]
          };
        }
        if (query.includes("INSERT INTO dbo.Incapacidades")) {
          eventos.push("crear-detalle");
          expect(parametros.tipoIncapacidadId).toBe(datos.tipoIncapacidadId);
          expect(parametros.numeroDocumento).toBe(datos.numeroDocumento);
          return {
            rowsAffected: [1]
          };
        }
        if (query.includes("INNER JOIN dbo.Incapacidades")) {
          eventos.push("leer-incapacidad");
          return {
            recordset: [solicitudCreada]
          };
        }
        expect(query).toMatch(/INSERT INTO dbo\.Bitacora/);
        eventos.push("bitacora");
        expect(parametros.UsuarioId).toBe(usuario.UsuarioId);
        expect(parametros.Entidad).toBe("SolicitudesIncapacidades");
        expect(parametros.RegistroId).toBe(solicitudCreada.SolicitudId);
        expect(parametros.Accion).toBe("CREAR");
        expect(JSON.parse(parametros.DatosNuevos).SolicitudId).toBe(31);
        if (fallaBitacora) throw errorBitacora;
        return {
          rowsAffected: [1]
        };
      }
    }));
    if (fallaBitacora) {
      await assert.rejects(incapacidades.solicitarIncapacidad(datos, usuario), error => error === errorBitacora);
      expect(eventos.at(-1)).toBe("rollback");
      expect(eventos.includes("commit")).toBe(false);
    } else {
      expect(await incapacidades.solicitarIncapacidad(datos, usuario)).toEqual(solicitudCreada);
      expect(eventos).toEqual(["begin", "bloquear", "tipo", "buscar-documento", "buscar-superposicion", "crear-cabecera", "crear-detalle", "leer-incapacidad", "bitacora", "commit"]);
    }
  });
}
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
