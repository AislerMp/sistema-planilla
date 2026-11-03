import { test, beforeEach, afterEach, jest, expect } from "@jest/globals";
import assert from "node:assert/strict";
// Se simula solo el cuadro de SweetAlert, sin navegador ni peticiones a la API.
let opciones;
let respuesta;
jest.unstable_mockModule("sweetalert2/dist/sweetalert2.js", () => ({
  default: {
    fire: jest.fn(async configuracion => {
      opciones = configuracion;
      return respuesta;
    })
  }
}));
const {
  confirmarAprobacion
} = await import("../../src/utils/notifications.js");
for (const tipoSolicitud of ["vacaciones", "incapacidad"]) {
  for (const enviarARh of [false, true]) {
    test(`${tipoSolicitud}: confirmar ${enviarARh ? "envío a RH" : "aprobación"} identifica la solicitud y ofrece cancelar`, async () => {
      respuesta = {
        isConfirmed: true
      };
      expect(await confirmarAprobacion({
        tipoSolicitud,
        solicitudId: 37,
        enviarARh
      })).toBe(true);
      expect(opciones.text.includes(`${tipoSolicitud} #37`)).toBeTruthy();
      expect(opciones.confirmButtonText).toBe(enviarARh ? "Sí, enviar a RH" : "Sí, aprobar");
      expect(opciones.showCancelButton).toBe(true);
      expect(opciones.focusCancel).toBe(true);
    });
  }
}
test("cancelar, Escape o cerrar el cuadro no confirma la aprobación", async () => {
  for (const dismiss of ["cancel", "esc", "backdrop", "close"]) {
    respuesta = {
      isConfirmed: false,
      isDismissed: true,
      dismiss
    };
    expect(await confirmarAprobacion({
      tipoSolicitud: "vacaciones",
      solicitudId: 37
    })).toBe(false);
  }
});
test("admite un contenedor cuando la confirmación se abre dentro de un diálogo", async () => {
  respuesta = {
    isConfirmed: true
  };
  const target = {};
  await confirmarAprobacion({
    tipoSolicitud: "vacaciones",
    solicitudId: 37
  }, target);
  expect(opciones.target).toBe(target);
});
afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
