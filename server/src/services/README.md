# Servicios del backend

Los servicios validan entradas y reglas de negocio; los repositorios ejecutan consultas parametrizadas sobre SQL Server. Las entradas usan camelCase y los registros consultados conservan los nombres de columna de SQL Server (`UsuarioId`, `Nombres`, `Activo`, etc.).

## Funciones disponibles

| Archivo | Funciones |
| --- | --- |
| `authService.js` | `loginUser(username, password)`, `registerUser(user)`, `getUsers()`, `getUser(id)`, `changePassword(id, currentPassword, newPassword)` |
| `colaboradorService.js` | `getColaboradores()`, `getColaborador(id)`, `createNewColaborador(data)`, `updateExistingColaborador(id, data)`, `toggleColaborador(id, activo)` |
| `puestosService.js` | `getPuestos()`, `getPuesto(id)`, `createNewPuesto(data)`, `updateTarifaPuesto(id, tarifaHora)`, `togglePuesto(id, activo)` |
| `restaurantesService.js` | `getRestaurantes()`, `getRestaurante(id)`, `createNewRestaurante(data)`, `updateExistingRestaurante(id, data)`, `toggleRestaurante(id, activo)`, `deactivateRestaurante(id)` |
| `rolesService.js` | `getRoles()`, `getRol(id)` |
| `ubicacionesService.js` | `getProvincias()`, `getProvincia(id)`, `getCantones(provinciaId)`, `getCanton(id)`, `getDistritos(cantonId)`, `getDistrito(id)` |

## Entradas

- **Usuario:** `nombreUsuario`, `password`, `rolId` y `colaboradorId` son obligatorios. El rol debe existir; no se verifica un estado porque Roles no tiene columna `Activo`. El colaborador debe existir, estar activo y no tener otra cuenta, incluso inactiva.
- **Colaborador:** `identificacion`, `correo`, `nombre`, `apellido`, `fechaIngreso`, `restauranteId` y `puestoId`. Son opcionales `fechaSalida`, `distritoId` y `detalleDireccion`. Restaurante y puesto deben estar activos; el distrito debe existir cuando se indica.
- **Puesto:** `nombre` y `tarifaHora` opcional. Se admiten también `Nombre` y `TarifaHora` por compatibilidad con el repositorio original. La tarifa debe ser positiva y caber en `DECIMAL(12,2)`; `null` permite dejarla pendiente.
- **Restaurante:** `nombre`; `distritoId` y `detalleDireccion` son opcionales, pero deben enviarse juntos o ambos ausentes, según la restricción SQL.

Las fechas se envían como `YYYY-MM-DD`; se rechazan fechas imposibles y salidas anteriores al ingreso. Los IDs deben ser enteros positivos compatibles con SQL `INT`. El estado debe ser un booleano real (`true` o `false`), no una cadena ni un número. Las ediciones de colaboradores y restaurantes reciben los mismos campos obligatorios que la creación; los opcionales omitidos quedan en `null`.

Las contraseñas son obligatorias y conservan sus espacios. Los servicios de usuarios nunca devuelven `PasswordHash`.

## Resultados y errores

- Los listados de usuarios, colaboradores, puestos y restaurantes devuelven solamente activos. Roles y ubicaciones devuelven sus catálogos completos.
- Las consultas individuales de colaboradores, puestos y restaurantes también permiten consultar inactivos. La consulta individual de usuarios exige que estén activos.
- Crear usuarios o colaboradores devuelve el ID generado. Crear puestos o restaurantes devuelve `true`, conservando el contrato de sus repositorios. Las actualizaciones y cambios de estado devuelven `true`.
- Las validaciones explícitas con `if` lanzan errores con `status`: `400` para datos inválidos, `401` para credenciales incorrectas, `404` para registros inexistentes y `409` para referencias inactivas o cuentas ya vinculadas/nombres ya utilizados detectados antes de guardar.
- Los servicios llaman directamente a los repositorios y no contienen `try/catch`. Los errores de SQL Server, incluidos duplicados y restricciones, se propagan con su información original. Su captura y tratamiento se implementarán en los controladores cuando se desarrolle esa capa.

## Integración y comprobación

Estos servicios todavía no están expuestos por controladores ni rutas; la API conserva únicamente `/api/health`. El login verifica credenciales y devuelve el usuario: aún debe integrarse con el mecanismo de sesión y los permisos. El controlador de cambio de contraseña debe obtener el ID de la identidad autenticada, y las operaciones administrativas deben comprobar permisos.

Desde `server`, ejecutar `npm test` (`npm.cmd test` en PowerShell si bloquea `npm.ps1`). Las pruebas usan el ejecutor de Node y bcrypt real, con consultas SQL simuladas: no necesitan `.env` ni modifican datos. Comprueban validaciones, autenticación, parámetros SQL y conflictos.

`npm run db:check` verifica la conexión real usando `.env`. Para ejecutar los repositorios deben existir las ocho tablas de `database/migrations/001_crear_tablas_base.sql`. La migración es para una instalación nueva; los cambios de una base ya instalada requieren migraciones adicionales. Las pruebas automatizadas no sustituyen la comprobación de operaciones contra ese esquema real.
