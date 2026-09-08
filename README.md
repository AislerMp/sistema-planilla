# Sistema Web para la Gestión de Pagos de Planilla

Prototipo académico desarrollado por Aisler Moreno Pérez para la Universidad Internacional de las Américas (UIA), enfocado en la gestión de pagos de planilla de un restaurante KFC en San José, Costa Rica.

## Estado del proyecto

Etapa inicial: estructura de carpetas y documentación preparadas. React, Node.js/Express y la conexión con SQL Server se configurarán en el siguiente paso. Este machote todavía no contiene una aplicación ejecutable ni tablas creadas. No corresponde ejecutar `npm install` o `npm run dev` hasta incorporar los respectivos archivos `package.json`.

## Datos del repositorio

- **Nombre propuesto:** `sistema-planilla`
- **Descripción para GitHub:** Prototipo académico de gestión de planilla para un restaurante KFC en San José, Costa Rica, con React, Node.js, Express y SQL Server.
- **Autor:** Aisler Moreno Pérez.

## Tecnologías previstas

| Componente | Tecnología | Puerto local propuesto |
| --- | --- | --- |
| Interfaz web | React con Vite | 5173 |
| Backend/API | Node.js y Express | 4000 |
| Base de datos | SQL Server | 1433 |

Los puertos son valores previstos para la configuración. El puerto de SQL Server se comprobará según la instancia instalada. El prototipo operará dentro de la red local; durante el desarrollo sus componentes podrán ejecutarse en un mismo equipo.

## Organización de carpetas

| Ruta | Responsabilidad |
| --- | --- |
| `client/public` | Archivos públicos del frontend. |
| `client/src/components` | Componentes visuales reutilizables. |
| `client/src/pages` | Pantallas de la aplicación. |
| `client/src/routes` | Navegación y rutas de la interfaz. |
| `client/src/services` | Solicitudes del frontend a la API. |
| `client/src/hooks` | Lógica reutilizable de React. |
| `client/src/utils` | Funciones auxiliares de la interfaz. |
| `client/src/assets` | Imágenes, iconos y otros recursos. |
| `server/src/routes` | Rutas de la API y asociación de manejadores. |
| `server/src/middlewares` | Autenticación, permisos y tratamiento común de solicitudes. |
| `server/src/controllers` | Recepción de datos y coordinación de respuestas HTTP. |
| `server/src/services` | Casos de uso, reglas de negocio y cálculos. |
| `server/src/repositories` | Consultas y operaciones sobre SQL Server. |
| `server/src/config` | Configuración del servidor y conexión a datos. |
| `server/src/utils` | Funciones auxiliares del backend. |
| `database/migrations` | Cambios numerados de estructura de la base de datos. |
| `database/seeds` | Catálogos iniciales y datos ficticios de desarrollo. |
| `docs/arquitectura` | Diagramas y decisiones de arquitectura. |
| `docs/casos-de-uso` | Especificaciones y diagramas de casos de uso. |

Los archivos `.gitkeep` permiten conservar en Git las carpetas todavía vacías. Podrán retirarse cuando cada carpeta tenga contenido.

## Arquitectura prevista

La presentación se implementará con React; el backend concentrará la lógica de negocio; los repositorios realizarán el acceso a SQL Server. Los `services` del frontend consumirán la API y los `services` del backend ejecutarán las reglas del sistema.

Las solicitudes protegidas pasarán por los middlewares de autenticación y permisos antes de llegar al controlador. El controlador llamará al servicio correspondiente y este utilizará los repositorios cuando necesite datos. Las respuestas regresarán al navegador mediante la API. La interfaz no accederá directamente a SQL Server.

## Alcance funcional previsto

- Administración de usuarios, roles y colaboradores.
- Marcas de entrada y salida, asistencia y horas trabajadas.
- Solicitud y revisión de horas extraordinarias.
- Permisos laborales, incapacidades y vacaciones.
- Deducciones legales y adicionales autorizadas.
- Períodos, generación y consulta de planillas.
- Cierre de planilla y registro del pago como operaciones separadas.
- Liquidaciones laborales y aguinaldos.
- Comprobantes, reportes e historial de modificaciones.

La información visible dependerá del perfil: colaborador, gerente, Recursos Humanos o administrador. El gerente tendrá acceso al restaurante asignado. Las modificaciones deberán generar automáticamente su registro de auditoría.

## Base de datos

Se diseñará el modelo general y se implementará por módulos. Los cambios se conservarán como scripts numerados en `database/migrations`. Una migración ya aplicada se mantendrá intacta; cualquier cambio posterior se documentará en una nueva migración. Se definirá el mecanismo de ejecución y registro de migraciones al configurar la base de datos.

Los datos iniciales se separarán de los cambios de estructura. Se utilizarán datos ficticios para las pruebas y se conservarán los montos históricos de las planillas cerradas. La creación de nuevas tablas deberá reutilizar las relaciones existentes con colaboradores y períodos.

## Configuración local pendiente

1. Instalar y configurar React con Vite en `client`.
2. Instalar y configurar Node.js con Express en `server`.
3. Definir scripts de desarrollo y versiones de dependencias.
4. Copiar los archivos `.env.example` como `.env` y completar la configuración local.
5. Configurar SQL Server y verificar la conexión desde el backend.
6. Implementar el primer módulo completo y comprobar su funcionamiento.

Los archivos `.env.example` son plantillas sin credenciales. Los archivos `.env`, dependencias, respaldos de base de datos y documentos cargados por usuarios están excluidos mediante `.gitignore`. Las variables del frontend son visibles en el navegador y no deben contener secretos.

## Inicio del control de versiones

Después de extraer el machote en el equipo de desarrollo, abrir una terminal en la carpeta `sistema-planilla` y ejecutar:

```bash
git init -b main
git add .
git commit -m "chore: agregar estructura inicial del proyecto"
```

Cuando se cree el repositorio en GitHub, utilizar la URL real proporcionada por GitHub:

```bash
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Sustituir `URL_DEL_REPOSITORIO` antes de ejecutar el comando. Crear el repositorio remoto vacío para publicar este README junto con el resto del machote.
