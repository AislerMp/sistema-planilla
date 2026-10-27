# Jornadas y catálogo de feriados

## Reglas operativas iniciales

`server/src/shared/utils/jornadaUtils.js` concentra los límites ordinarios:

| Jornada | Minutos ordinarios |
| --- | ---: |
| DIURNA | 480 |
| MIXTA | 420 |
| NOCTURNA | 360 |

El valor `LIMITES_ORDINARIOS_MINUTOS.MIXTA` es una configuración inicial del
proyecto pendiente de confirmación empresarial. Para utilizar 480 basta cambiar
ese valor. No representa una política empresarial confirmada.

Una asistencia con `TipoJornada = NULL` utiliza el límite anterior de 480 por
compatibilidad (`LIMITE_SIN_CLASIFICAR`). Eso no la clasifica como diurna.
Consultar o ajustar una asistencia histórica no calcula su tipo de jornada.

`clasificarJornada(intervalos)` usa únicamente intervalos completos. Compara
los timestamps UTC recibidos de SQL Server (`useUTC: true`) con las ventanas
05:00–19:00 de Costa Rica (UTC-6), incluso al cruzar medianoche. No incluye los
espacios entre intervalos ni agrega descansos. Sin tiempo completo registrado
devuelve ambos valores en `null`.

Si hay tiempo diurno y nocturno, 210 minutos nocturnos o más clasifican el día
como nocturno; por debajo de ese umbral es mixto. Una jornada completamente
nocturna no necesita alcanzar ese umbral.

## Cierre de una marca

`registrarSalida` mantiene las validaciones de acceso, período y solicitudes.
Dentro de su transacción:

1. Guarda la salida y vuelve a consultar los intervalos del día asignado.
2. Suma los minutos completos de cada intervalo cerrado. No usa minutos ya
   separados en ordinarias para obtener el total.
3. Clasifica el día, guarda `TipoJornada` y registra sus cambios en bitácora.
4. Actualiza `MinutosCalculados` con el total de las marcas.
5. Sincroniza las ordinarias y extras usando la clasificación recién guardada.
6. Confirma la transacción. Un error revierte toda la operación.

La segunda salida vuelve a clasificar el día completo. El corte de asignación
de las marcas sigue siendo a las 4 a. m.; no interviene en los límites horarios
de clasificación. Se conserva el comportamiento previo: las operaciones buscan
la marca pendiente de la fecha asignada al instante de salida. Cerrar después
de las 4 a. m. una marca asignada al día anterior sigue siendo una limitación
del flujo existente; no se cambia esa regla en esta implementación.

## Separación de minutos y ajustes

Para 13:00–16:00 y 17:00–22:00 se guardan:

```text
AsistenciasDiarias:
  TipoJornada = MIXTA
  MinutosCalculados = 480
  MinutosAjustados = 420

HorasExtras:
  MinutosDetectados = 60
  MinutosAjustados = NULL
```

`MinutosCalculados` conserva el total marcado. `MinutosAjustados` sigue
sirviendo para las ordinarias separadas o el ajuste manual cuando corresponde.
No se convierte tiempo a equivalencias de pago ni se cambian datos históricos
al consultar.

Había una ambigüedad: después de sincronizar, `MinutosAjustados` puede contener
solo las ordinarias. Volver a usarlo como total pierde las extras. Por eso el
cuarto argumento interno de `sincronizarHorasExtras` ahora recibe el total
manual explícito, en lugar de un booleano:

```js
// Marcas: toma la base de MinutosCalculados.
await sincronizarHorasExtras(asistencia, usuarioId, transaction);
// Ajuste manual: usa el total ingresado y restablece el ajuste previo de extras.
await sincronizarHorasExtras(asistencia, usuarioId, transaction, minutos);
// Incapacidad: anula ordinarias y extras sin cambiar el total de las marcas.
await sincronizarHorasExtras(asistencia, usuarioId, transaction, 0);
```

Repetir la sincronización con la misma base conserva los minutos y el único
registro de extras. Se actualizaron todas las llamadas de producción.

`actualizarHorasExtra` conserva la regla manual anterior: asignar extras
positivas completa las ordinarias hasta su límite; asignar cero conserva una
jornada corta. Ahora aplica el límite de su tipo de jornada y crea la base
automática a partir del total original de marcas. No reconstruye ni interpreta
la intención de ajustes históricos.

## Feriados

`server/src/modules/planillas/feriados.repository.js` consulta fecha exacta
(objeto o `null`) y rango inclusivo (lista ordenada). Las consultas usan
parámetros `sql.Date` y columnas explícitas. No calcula pagos ni aplica factores.
No se agregaron endpoints ni se ejecutaron migraciones.

## Verificación

Desde `server`:

```text
node --test test/jornadaUtils.test.js test/jornadas.services.test.js test/feriados.repository.test.js
node --test --test-name-pattern="salida de madrugada|sincronizar separa" test/services.test.js
node --test
```

Las pruebas de funciones puras y los escenarios de servicios/repositorios usan
el runner existente. Los escenarios SQL simulan el transporte y sus resultados;
no prueban la ejecución contra SQL Server real. Las pruebas de zona horaria
también ejecutan la clasificación en procesos con UTC, Costa Rica y Tokio.

Resultado final: las 39 pruebas nuevas pasan. El grupo de 109 pruebas de
jornadas, extras, incapacidades y bloqueos por vacaciones también pasa, al igual
que los tres escenarios existentes de salida de madrugada y sincronización.
La suite completa actual ejecuta 716 pruebas: 697 aprobadas y 19 fallidas.

La suite completa ya tenía 19 fallos antes de estos cambios. Se reprodujeron en
una copia completa de `HEAD`: 677 pruebas, 658 aprobadas y 19 fallidas. Incluyen
fixtures incompletos en ajustes de asistencia, inicialización de saldos al crear
colaboradores y escenarios antiguos de vacaciones. Esos mismos fallos se
mantienen fuera del alcance de esta implementación.

Queda pendiente ejecutar los escenarios con una base SQL Server exclusiva de
pruebas, incluidas las consultas reales del catálogo de feriados.

## Gestión de asistencias en React

Las consultas de asistencias y la respuesta del ajuste de asistencia agregan
`LimiteOrdinarioMinutos` mediante `obtenerLimiteOrdinarioMinutos` del servidor.
El límite no es una columna SQL. React utiliza ese valor sin mantener otra
configuración de límites por jornada.

`EditarHorasModal` conserva el total ingresado y muestra el reparto como vista
previa. El modo «Total de horas del día» envía `{ minutos: total, motivo }` al
endpoint de asistencia. El modo «Solo horas extra» utiliza el endpoint existente
de extras con `{ minutosAjustados, motivo }`. Al terminar, la página vuelve a
consultar la tabla: los valores locales no se consideran definitivos. Sin un
límite válido, la distribución automática muestra un error y no guarda.

La tabla mantiene la edición solo para gerencia y bloquea períodos que no
permiten ajustes o cuyo plazo terminó. La etiqueta de jornada es independiente
del botón de edición y permite consultar la información aun en modo de lectura.
Reutiliza `Dialog`, con cierre por cancelar, botones y retorno explícito del foco.

Pruebas del cliente desde `client`:

```text
node --test
npm.cmd --script-shell=cmd.exe run build
```

También hay una prueba de componentes en navegador en
`client/test/asistencias.interfaz.html`. Con Vite iniciado y `VITE_API_URL`
configurado, abrir `/test/asistencias.interfaz.html`. Intercepta las peticiones de
negocio y simula sus respuestas; no modifica datos de la API ni de SQL Server.
Comprueba reparto, total enviado, recarga, extras independientes, límites
ausentes, detalle, foco, restricciones de período y estilos en ambos temas.

Queda pendiente comprobar contra una sesión y base reales, y realizar la prueba
manual con teclado y pantalla táctil. El evento de cancelación y el manejo del
foco se verifican automáticamente en el navegador.

## Colaboradores sin asistencias

La gestión consulta en paralelo las asistencias y el listado de colaboradores
del restaurante, usando las rutas existentes. Gerencia continúa limitada por el
servidor a su restaurante; RH y administración utilizan el restaurante aplicado
en los filtros. El colaborador consulta únicamente sus propios datos.

La tabla crea primero las filas del personal cuyo vínculo laboral coincide con
el rango consultado, aunque estén inactivos actualmente. Luego incorpora las
asistencias recibidas, sin duplicar colaboradores ni descartar registros de
personas que ya no estén en el listado actual del restaurante. Los días vacíos
muestran «—», con totales cero: no se crean asistencias ni se califican ausencias.

Las consultas de listado vacías ahora responden `200` con `[]`. La consulta de
una asistencia individual inexistente conserva su `404`. El rango visible se
obtiene del período o filtros; sin filtros se conserva la semana y el corte de
las 4 a. m. de Costa Rica, incluso si no existe ninguna marca.

El listado de personal utiliza su restaurante actual. Sin un historial de
traslados no se puede reconstruir qué restaurante correspondía a una persona
en un período anterior si tampoco tiene asistencias allí. Esta implementación
no introduce tablas ni inventa ese historial.

Verificación de esta ampliación: 48 pruebas del cliente y 28 casos de componentes
y página completa en Edge sin ventana. Los casos de navegador usan respuestas
simuladas e incluyen los cuatro roles, períodos vacíos, vínculo laboral, filas
mixtas y conservación de los registros existentes. El build pasa. La suite del
servidor ejecuta 718 pruebas: 699 aprobadas y los mismos 19 fallos previos.
