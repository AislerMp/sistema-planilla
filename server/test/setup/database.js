import { beforeEach, jest } from "@jest/globals";
import { pool } from "../../src/shared/config/database.js";

// Si una prueba olvida simular el acceso a SQL, falla sin intentar conectarse.
beforeEach(() => {
  jest.spyOn(pool, "connect").mockRejectedValue(
    new Error("La suite requiere un transporte SQL simulado; no se permiten conexiones reales."),
  );
});
