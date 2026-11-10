import { expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { randomUUID } from "node:crypto";
import * as validaciones from "../../src/shared/utils/serviceUtils.js";

// Controllers y auxiliar reales; guardado, consulta del aviso y archivos simulados.
const grupos = [
  {
    modulo: "permisosLaborales/permisosLaborales.controller.js",
    servicio: "./permisosLaborales.service.js",
    acciones: [
      ["crearPermisoLaboralController", "solicitarPermiso", 201],
      ["resolverPermisoLaboralController", "resolverPermiso", 200],
      ["revertirPermisoLaboralController", "revertirPermiso", 200],
    ],
    consultas: {
      obtenerPermisoPorId: "obtenerPermisoPorId",
      listarMisPermisosController: "listarMisPermisos",
      listarPermisosPorRestauranteController: "listarPermisosPorRestaurante",
    },
  },
  {
    modulo: "extras/horasExtras.controller.js",
    servicio: "./horasExtras.service.js",
    acciones: [
      ["crearSolicitudController", "crearSolicitudHorasExtras", 201, null, "Solicitud de horas extras creada correctamente."],
      ["resolverSolicitudController", "resolverSolicitudHorasExtras", 200, null, "Solicitud de horas extras resuelta correctamente."],
      ["revertirSolicitudController", "revertirSolicitudHorasExtras", 200, null, "Solicitud de horas extras revertida correctamente."],
    ],
    consultas: {
      obtenerSolicitudController: "getSolicitudById",
      listarMisSolicitudesController: "getSolicitudesByColaborador",
      listarSolicitudesRestauranteController: "getSolicitudesByRestaurante",
      actualizarHorasExtraController: "actualizarHorasExtra",
    },
  },
  {
    modulo: "vacaciones/vacaciones.controller.js",
    servicio: "./services/vacaciones.service.js",
    acciones: [
      ["crearVacacionesController", "solicitarVacaciones", 201],
      ["revisarVacacionesGerenteController", "revisarVacacionesGerente", 200],
      ["resolverVacacionesRhController", "resolverVacacionesRH", 200, "vacacionActualizada"],
      ["revertirVacacionesController", "revertirVacaciones", 200],
    ],
    consultas: {
      getVacacionController: "getVacacionesById",
      getCalculosVacacionesController: "obtenerCalculosVacaciones",
      getMisVacacionesController: "getMisVacaciones",
      getVacacionesByRestauranteController: "getVacacionesByRestaurante",
      getMiSaldoVacacionesController: "obtenerSaldoVacaciones",
      getSaldoVacacionesByColaboradorController: "obtenerSaldoVacaciones",
    },
  },
  {
    modulo: "incapacidades/incapacidades.controller.js",
    servicio: "./services/incapacidades.services.js",
    acciones: [
      ["crearIncapacidadController", "solicitarIncapacidad", 201],
      ["revisarIncapacidadGerenteController", "revisarIncapacidadGerente", 200],
      ["resolverIncapacidadRhController", "resolverIncapacidadRh", 200, "incapacidadActualizada"],
      ["revertirIncapacidadController", "revertirIncapacidad", 200],
    ],
    consultas: {
      getTiposIncapacidadesController: "listarTiposIncapacidad",
      getIncapacidadController: "obtenerIncapacidad",
      getMisIncapacidades: "listarMisIncapacidades",
      getIncapacidadesByRestauranteController: "listarIncapacidadesPorRestaurante",
      getCalculoIncapacidadController: "obtenerCalculoIncapacidad",
      descargarComprobanteController: "obtenerIncapacidad",
    },
  },
  {
    modulo: "deducciones/deducciones.controller.js",
    servicio: "./services/solicitudesDeducciones.service.js",
    acciones: [
      ["solicitarDeduccion", "solicitarDeduccion", 201],
      ["resolverSolicitudRh", "resolverSolicitud", 200],
    ],
    consultas: {
      getMisSolicitudes: "listarMisSolicitudes",
      getSolicitudesPorRestaurante: "listarSolicitudesPorRestaurante",
      getSolicitudById: "obtenerSolicitud",
    },
  },
];
const archivo = (ruta) => new URL(`../../src/modules/${ruta}`, import.meta.url);
const fuenteAuxiliar = await readFile(archivo("notificaciones/notificaciones.service.js"), "utf8");
const fuentes = await Promise.all(grupos.map((grupo) => readFile(archivo(grupo.modulo), "utf8")));
const catalogo = ["getDeducciones", "getDeduccionesById", "crearDeduccion", "actualizarDeduccion", "crearVersionDeduccion", "finalizarVigenciaDeduccion"];
const serviciosCatalogo = ["getDeduccionesService", "obtenerDeduccionById", "crearDeduccion", "actualizarDatosDeduccion", "crearVersionDeduccion", "finalizarVigenciaDeduccion"];
const crearMocks = (nombres) => Object.fromEntries(nombres.map((nombre) => [nombre, jest.fn().mockResolvedValue({})]));
async function cargar(grupo) {
  const consultarSolicitud = jest.fn();
  const logger = { error: jest.fn() };
  const context = createContext({ console: logger });
  const notificaciones = new SourceTextModule(fuenteAuxiliar, { context });
  await notificaciones.link((ruta) => {
    const dependencias = {
      "node:crypto": { randomUUID },
      "../../shared/utils/serviceUtils.js": validaciones,
      "../colaboradores/colaboradores.service.js": { getRestaurantePermitido: jest.fn() },
      "../solicitudes/solicitudes.repository.js": { getSolicitudesBaseById: consultarSolicitud },
    };
    const exports = dependencias[ruta];
    if (!exports) throw new Error(`Dependencia inesperada: ${ruta}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [nombre, valor] of Object.entries(exports)) this.setExport(nombre, valor);
    }, { context });
  });
  await notificaciones.evaluate();
  const services = crearMocks([...grupo.acciones.map((a) => a[1]), ...Object.values(grupo.consultas)]);
  const eliminarComprobante = jest.fn();
  const controller = new SourceTextModule(fuentes[grupos.indexOf(grupo)], { context });
  await controller.link((ruta) => {
    if (ruta === "../notificaciones/notificaciones.service.js") return notificaciones;
    const dependencias = {
      [grupo.servicio]: services,
      "./services/saldosVacaciones.service.js": { obtenerSaldoVacaciones: services.obtenerSaldoVacaciones },
      "./services/deducciones.service.js": crearMocks(serviciosCatalogo),
      "../../shared/utils/serviceUtils.js": validaciones,
      "./incapacidades.upload.js": {
        guardarComprobante: jest.fn().mockResolvedValue({ comprobanteRuta: "incapacidades/prueba.pdf" }),
        eliminarComprobante,
        obtenerRutaComprobante: jest.fn().mockReturnValue("comprobante-simulado.pdf"),
      },
    };
    const exports = dependencias[ruta];
    if (!exports) throw new Error(`Dependencia inesperada: ${ruta}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [nombre, valor] of Object.entries(exports)) this.setExport(nombre, valor);
    }, { context });
  });
  await controller.evaluate();
  return { controllers: controller.namespace, notificaciones: notificaciones.namespace, services, consultarSolicitud, logger, eliminarComprobante };
}
const req = () => ({ params: { id: "31", solicitudId: "31", colaboradorId: "4" }, query: {}, body: { estado: "APROBADA" }, user: { UsuarioId: 7, ColaboradorId: 4, Rol: "RECURSOS_HUMANOS" }, file: {} });
const respuesta = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis(), download: jest.fn() });

for (const grupo of grupos) {
  for (const [nombre, service, status, propiedad, message] of grupo.acciones) {
    const estado = service.startsWith("revisar") ? "EN_REVISION_RH"
      : /^(solicitar|crear|revertir)/.test(service) ? "PENDIENTE" : "APROBADA";
    const solicitud = { SolicitudId: 31, Estado: estado };
    const resultado = propiedad ? { [propiedad]: solicitud, registroCalculoCreado: { CalculoId: 9 } } : solicitud;
    const body = message ? { message, solicitud: resultado } : resultado;

    test(`${nombre}: publica un único aviso y espera su término antes de responder`, async () => {
      const h = await cargar(grupo);
      let terminarAviso, inicioAviso;
      const iniciado = new Promise((resolve) => { inicioAviso = resolve; });
      h.services[service].mockResolvedValueOnce(resultado);
      h.consultarSolicitud.mockImplementationOnce(() => {
        inicioAviso();
        return new Promise((resolve) => { terminarAviso = resolve; });
      });
      const res = respuesta();
      const ejecucion = h.controllers[nombre](req(), res);
      await iniciado;
      expect(res.json).not.toHaveBeenCalled();
      terminarAviso({ SolicitudId: 31, Estado: "PENDIENTE" });
      await ejecucion;
      expect(h.consultarSolicitud).toHaveBeenCalledTimes(1);
      expect(h.consultarSolicitud).toHaveBeenCalledWith(31);
      const avisos = await h.notificaciones.listarNotificaciones({ Rol: "RECURSOS_HUMANOS" });
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject(solicitud);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith(body);
      expect(h.logger.error).not.toHaveBeenCalled();
    });

    test(`${nombre}: si falla el service no publica un aviso ni responde éxito`, async () => {
      const h = await cargar(grupo);
      const error = new Error("Guardado fallido");
      h.services[service].mockRejectedValueOnce(error);
      const res = respuesta();
      await expect(h.controllers[nombre](req(), res)).rejects.toBe(error);
      expect(h.consultarSolicitud).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      if (nombre === "crearIncapacidadController") expect(h.eliminarComprobante).toHaveBeenCalledWith("incapacidades/prueba.pdf");
    });

    test(`${nombre}: si falla el aviso conserva la respuesta de la solicitud guardada`, async () => {
      const h = await cargar(grupo);
      const error = new Error("Aviso fallido");
      h.services[service].mockResolvedValueOnce(resultado);
      h.consultarSolicitud.mockRejectedValueOnce(error);
      const res = respuesta();
      await h.controllers[nombre](req(), res);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith(body);
      expect(h.consultarSolicitud).toHaveBeenCalledTimes(1);
      expect(h.logger.error).toHaveBeenCalledWith("No se pudo agregar el aviso de la solicitud:", error);
      expect(h.eliminarComprobante).not.toHaveBeenCalled();
    });
  }

  test(`${grupo.modulo}: consultas y operaciones fuera del alcance no publican avisos`, async () => {
    const h = await cargar(grupo);
    for (const nombre of Object.keys(grupo.consultas)) await h.controllers[nombre](req(), respuesta());
    if (grupo.modulo.startsWith("deducciones/")) {
      for (const nombre of catalogo) await h.controllers[nombre](req(), respuesta());
    }
    expect(h.consultarSolicitud).not.toHaveBeenCalled();
    expect(h.logger.error).not.toHaveBeenCalled();
  });
}
