import { createServer } from "node:http";
import { once } from "node:events";

import app from "./app.js";
import { getConnection, closeConnection } from "./shared/config/database.js";

import { iniciarTareaPeriodos } from "./modules/periodoPlanilla/periodosPlanillas.tarea.js";
import { iniciarTareaVacaciones, detenerTareaVacaciones } from "./modules/vacaciones/vacaciones.tarea.js";

const PORT = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT debe ser un número entero entre 1 y 65535");
}

async function startServer() {
  let temporizadorPeriodos;
  try {
    // Primero comprobamos la conexión con SQL Server.
    await getConnection();

    console.log("Conexión con SQL Server establecida.");

    temporizadorPeriodos = await iniciarTareaPeriodos(process.env.USUARIO_SISTEMA_ID);
    await iniciarTareaVacaciones(process.env.USUARIO_SISTEMA_ID);
    // Luego iniciamos el servidor HTTP.
    const server = createServer(app);

    server.listen(PORT);

    // Esperamos la confirmación de que el puerto está disponible.
    await once(server, "listening");

    console.log(`API disponible en http://localhost:${PORT}/api`);
  } catch (error) {
    console.error("No fue posible iniciar el backend:");
    console.error(error.message);

    process.exitCode = 1;

    // Una recuperación o escucha fallida no debe dejar tareas vivas sin API.
    clearInterval(temporizadorPeriodos);
    await detenerTareaVacaciones();

    try {
      await closeConnection();
    } catch (closeError) {
      console.error("Error al cerrar el pool:", closeError.message);
    }
  }
}

startServer();
