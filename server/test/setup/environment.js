// No se carga .env: la suite nunca debe usar las credenciales de desarrollo.
Object.assign(process.env, {
  NODE_ENV: "test",
  DB_SERVER: "test.invalid",
  DB_PORT: "1433",
  DB_NAME: "test",
  DB_USER: "test",
  DB_PASSWORD: "test",
  SESSION_SECRET: "secreto-exclusivo-de-pruebas",
});
