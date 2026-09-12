import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { once } from "node:events";
import { AppError } from "../src/utils/AppError.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

test("el middleware expone solo mensajes de AppError 4xx y normaliza estados inválidos", (t) => {
  t.mock.method(console, "error", () => {});
  for (const [error, status, message] of [
    [new AppError("Sin permiso", 403), 403, "Sin permiso"],
    [new AppError("Detalle privado", 500), 500, "No fue posible procesar la solicitud"],
    [new Error("Detalle SQL"), 500, "No fue posible procesar la solicitud"],
    [Object.assign(new Error("Detalle parser"), { status: 400 }), 400, "Solicitud inválida"],
    [Object.assign(new Error("Detalle interno"), { statusCode: 413 }), 413, "No fue posible procesar la solicitud"],
    ...[200, 600, "404", NaN].map(status => [
      new AppError("Estado inválido", status), 500, "No fue posible procesar la solicitud",
    ]),
  ]) {
    const result = {};
    const res = {
      status(value) { result.status = value; return this; },
      json(body) { result.body = body; return this; },
    };
    errorHandler(error, {}, res, () => assert.fail("Respuesta sin iniciar"));
    assert.equal(result.status, status);
    assert.deepEqual(result.body, { message });
  }
});

test("si los headers ya salieron se delega el error sin responder nuevamente", () => {
  const error = new Error("Fallo tardío");
  let received;
  errorHandler(error, {}, { headersSent: true }, value => { received = value; });
  assert.equal(received, error);
});

test("JSON inválido llega al middleware con un mensaje seguro", async () => {
  const app = express();
  app.use(express.json());
  app.post("/", () => assert.fail("El parser debe rechazar el cuerpo"));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"password": "privado",',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Solicitud inválida" });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
