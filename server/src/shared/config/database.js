import sql from "mssql";

const requiredVariables = [
  "DB_SERVER",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]?.trim()) {
    throw new Error(`Falta configurar ${variable} en server/.env`);
  }
}

const port = Number(process.env.DB_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT debe ser un puerto válido");
}

const config = {
  server: process.env.DB_SERVER,
  port,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  options: {
    encrypt: process.env.DB_ENCRYPT !== "false",
    trustServerCertificate:
      process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    useUTC: true,
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

  connectionTimeout: 15000,
  requestTimeout: 15000,
};

export const pool = new sql.ConnectionPool(config);

pool.on("error", (error) => {
  console.error("Error del pool de SQL Server:", error.message);
});

export async function connectDatabase() {
  return pool.connect();
}

// Guarda la promesa de conexión, incluso mientras está pendiente.
let connectionPromise = null;

// 4. Obtener el pool conectado.
export async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = pool.connect().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
}

// 5. Preparar una consulta independiente o transaccional.
export async function createRequest(transaction = null) {
  if (transaction) 
    return transaction.request();
  
  const connectedPool = await getConnection();
  return connectedPool.request();
}

// 6. Iniciar una transacción sobre el mismo pool.
export async function beginTransaction() {
  const connectedPool = await getConnection();
  const transaction = new sql.Transaction(connectedPool);

  await transaction.begin();
  return transaction;
}

// 7. Cerrar al finalizar un script o apagar el backend.
export async function closeConnection() {
  if (!connectionPromise) return;

  try {
    // Esperar si la conexión inicial todavía está en curso.
    await connectionPromise;
  } catch {
    // La conexión inicial falló; no hay un pool conectado que cerrar.
    return;
  }

  await pool.close();
  connectionPromise = null;
}

export { sql };