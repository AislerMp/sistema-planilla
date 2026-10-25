import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

// Se simula solo el cuadro de SweetAlert, sin navegador ni peticiones a la API.
let opciones;
let respuesta;
globalThis.__confirmarAprobacionPrueba = async (configuracion) => {
  opciones = configuracion;
  return respuesta;
};
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "sweetalert2/dist/sweetalert2.js") {
      return {
        url: "data:text/javascript,export default { fire: globalThis.__confirmarAprobacionPrueba };",
        shortCircuit: true,
      };
    }
    if (specifier === "sweetalert2/dist/sweetalert2.min.css") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
let confirmarAprobacion;
try {
  ({ confirmarAprobacion } = await import("../src/utils/notifications.js"));
} finally {
  hook.deregister();
  delete globalThis.__confirmarAprobacionPrueba;
}

for (const tipoSolicitud of ["vacaciones", "incapacidad"]) {
  for (const enviarARh of [false, true]) {
    test(`${tipoSolicitud}: confirmar ${enviarARh ? "envío a RH" : "aprobación"} identifica la solicitud y ofrece cancelar`, async () => {
      respuesta = { isConfirmed: true };
      assert.equal(await confirmarAprobacion({ tipoSolicitud, solicitudId: 37, enviarARh }), true);
      assert.ok(opciones.text.includes(`${tipoSolicitud} #37`));
      assert.equal(opciones.confirmButtonText, enviarARh ? "Sí, enviar a RH" : "Sí, aprobar");
      assert.equal(opciones.showCancelButton, true);
      assert.equal(opciones.focusCancel, true);
    });
  }
}

test("cancelar, Escape o cerrar el cuadro no confirma la aprobación", async () => {
  for (const dismiss of ["cancel", "esc", "backdrop", "close"]) {
    respuesta = { isConfirmed: false, isDismissed: true, dismiss };
    assert.equal(await confirmarAprobacion({ tipoSolicitud: "vacaciones", solicitudId: 37 }), false);
  }
});

test("admite un contenedor cuando la confirmación se abre dentro de un diálogo", async () => {
  respuesta = { isConfirmed: true };
  const target = {};
  await confirmarAprobacion({ tipoSolicitud: "vacaciones", solicitudId: 37 }, target);
  assert.equal(opciones.target, target);
});
