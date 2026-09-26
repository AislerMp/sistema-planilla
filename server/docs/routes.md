Los prefijos completos se montan en `src/app.js`. Las rutas con acceso
"Autenticado" permiten cualquier rol; "Administrador" exige además
`req.user.rol === "ADMINISTRADOR"` mediante `soloAdministrador`.

| Método | URL | Acceso | Operación |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Público | Verificar credenciales |
| POST | `/api/auth/register` | Administrador | Crear usuario |
| GET | `/api/auth/users` | Autenticado | Listar usuarios |
| GET | `/api/auth/users/:id` | Autenticado | Consultar usuario |
| PATCH | `/api/auth/change-password` | Autenticado | Cambiar la contraseña propia |
| GET | `/api/colaboradores` | Autenticado | Listar colaboradores |
| GET | `/api/colaboradores/:id` | Autenticado | Consultar colaborador |
| POST | `/api/colaboradores` | Administrador | Crear colaborador |
| PUT | `/api/colaboradores/:id` | Administrador | Actualizar colaborador |
| DELETE | `/api/colaboradores/:id` | Administrador | Desactivar colaborador |
| POST | `/api/colaboradores/activate/:id` | Administrador | Activar colaborador |
| GET | `/api/puestos` | Autenticado | Listar puestos |
| GET | `/api/puestos/:id` | Autenticado | Consultar puesto |
| POST | `/api/puestos` | Administrador | Crear puesto |
| PATCH | `/api/puestos/:id/tarifa` | Administrador | Actualizar tarifa |
| POST | `/api/puestos/activate/:id` | Administrador | Activar puesto |
| DELETE | `/api/puestos/:id` | Administrador | Desactivar puesto |
| GET | `/api/restaurantes` | Autenticado | Listar restaurantes |
| GET | `/api/restaurantes/:id` | Autenticado | Consultar restaurante |
| POST | `/api/restaurantes` | Administrador | Crear restaurante |
| PUT | `/api/restaurantes/:id` | Administrador | Actualizar restaurante |
| POST | `/api/restaurantes/activate/:id` | Administrador | Activar restaurante |
| DELETE | `/api/restaurantes/:id` | Administrador | Desactivar restaurante |
| GET | `/api/roles` | Autenticado | Listar roles |
| GET | `/api/roles/:id` | Autenticado | Consultar rol |
| GET | `/api/ubicaciones/provincias` | Autenticado | Listar provincias |
| GET | `/api/ubicaciones/provincias/:id` | Autenticado | Consultar provincia |
| GET | `/api/ubicaciones/provincias/:provinciaId/cantones` | Autenticado | Listar cantones de una provincia |
| GET | `/api/ubicaciones/cantones/:id` | Autenticado | Consultar cantón |
| GET | `/api/ubicaciones/cantones/:cantonId/distritos` | Autenticado | Listar distritos de un cantón |
| GET | `/api/ubicaciones/distritos/:id` | Autenticado | Consultar distrito |

`PATCH .../tarifa` recibe `{ "tarifaHora": 1500 }`; `null` deja la tarifa
pendiente. Para colaboradores, puestos y restaurantes, `POST .../activate/:id`
activa el registro y `DELETE .../:id` lo desactiva. Ninguna de estas acciones
requiere body ni lee `activo` de la petición: las funciones del servicio fijan
`true` para activar y `false` para desactivar. Los `DELETE` realizan una baja
lógica y conservan el registro y su bitácora.

Las antiguas rutas `PATCH /api/puestos/:id/estado` y
`PATCH /api/restaurantes/:id/estado` fueron reemplazadas por esas acciones.

`PATCH /api/auth/change-password` recibe `currentPassword` y `newPassword`.
Siempre opera sobre `req.user.UsuarioId`, sin aceptar un ID de usuario del body.
Se conserva como operación personal para cualquier usuario autenticado.

La autenticación todavía necesita un middleware que verifique una sesión o token
y establezca `req.user` antes de montar estos routers. El login actual solo verifica
credenciales; sin `req.user`, las rutas protegidas responden 401.
