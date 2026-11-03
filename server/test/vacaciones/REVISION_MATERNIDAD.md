# Revisión de maternidad — 19 de octubre de 2026

> Informe histórico anterior a la migración a Jest. Las pruebas ahora están en las
> carpetas `incapacidades` y `vacaciones`; los comandos y el alcance actuales se
> describen en la [guía de pruebas](../../../docs/pruebas/README.md).

Se revisó el código actual y se aplicaron correcciones puntuales de la integración.
No se modificó React, el reloj del equipo ni datos de SQL Server. Las reglas
probadas son las reglas internas indicadas para el proyecto.

## Correcciones

- `calculoIncapacidades.services.js`: usa la consulta plural de cálculos y
  comprueba `length`; valida fechas almacenadas, porcentaje y coherencia de
  inicio/fin/plazo de cada período. Calcula cada tramo usando las fechas de la
  incapacidad y del período, sin guardar esas fechas o días duplicados.
  El cálculo genérico rechaza explícitamente maternidad para evitar usar un
  recorrido equivocado. La función específica no confirma ni revierte la
  transacción del servicio que la llama.
- `incapacidades.services.js`: consumidores de listas corregidos, incluida la
  reversión. La consulta pública conserva un objeto para un cálculo ordinario;
  cuando hay varios, devuelve los minutos totales y la lista completa `calculos`.
  Los identificadores singulares `CalculoId` y `PeriodoId` son `null` en ese caso,
  para no atribuir el total a un solo período. Se comprueba que el reconocimiento
  de maternidad contenga cálculos antes de confirmar la aprobación.
- `calculoIncapacidades.repository.js`: `getCalculosBySolicitud` devuelve todas
  las filas. SELECT, INSERT y OUTPUT usan únicamente las columnas del esquema 006.
- `incapacidades.repository.js`: la consulta por colaborador expone
  `CodigoTipoIncapacidad` para distinguir maternidad en la tarea diaria.
- `saldosVacaciones.service.js`: la tarea diaria omite el complemento semanal
  de un domingo ya cubierto por maternidad aprobada. Sigue excluyendo las
  asistencias del rango aprobado y conserva el comportamiento de enfermedad.

## Límite pendiente del esquema original

La migración 008 se retiró y no se hizo ningún cambio en SQL Server. El código
ya no necesita FechaInicioReconocida, FechaFinReconocida ni DiasReconocidos en
CalculosIncapacidad. Las fechas y los días de cada tramo salen de la intersección
entre Incapacidades y PeriodosPlanilla, cuyas fechas se consideran inmutables.

La migración 006 aún impone `UNIQUE (SolicitudId)`. Una maternidad dentro de un
solo período puede guardarse con el esquema actual. Si atraviesa varios períodos,
el segundo cálculo viola esa restricción y la aprobación se revierte. Para
mantener un cálculo por período se requiere acordar antes con el usuario un
cambio mínimo de unicidad a `(SolicitudId, PeriodoId)`. No se preparó ni ejecutó
esa migración sin su autorización.

## Pruebas ejecutadas

Todas se ejecutaron con `node --test` desde `server`, sin cargar `server/.env`.
Se utilizan servicios y repositorios reales con respuestas SQL simuladas y
fechas fijas mediante `t.mock.timers`; no se modifica el reloj del equipo.

Pruebas nuevas:

| Archivo | Casos | Resultado |
| --- | ---: | --- |
| `maternidadPeriodos.test.js` | 33 | Pasan |
| `maternidadResolucion.test.js` | 18 | Pasan |
| `maternidadVacaciones.test.js` | 15 | Pasan, incluidos tres casos que demuestran limitaciones |
| `calculoIncapacidades.repository.test.js` | 6 | Pasan |

Se ajustaron además `calculoIncapacidades.test.js`,
`incapacidades.service.test.js` e `incapacidades.routes.test.js` al recorrido
específico de maternidad y a la lectura después del bloqueo.

La ejecución relacionada incluyó esos archivos y las pruebas existentes de
repositorio de incapacidades, bloqueo por incapacidades, acumulación diaria y
bloqueo por vacaciones: **252/252 pasan** tras retirar la prueba de la
migración 008.

La suite completa del servidor se ejecutó antes y después:

| Ejecución | Total | Pasan | Fallan |
| --- | ---: | ---: | ---: |
| Antes | 600 | 582 | 18 |
| Después | 672 | 659 | 13 |

Los trece fallos finales ya estaban presentes antes de la revisión; no apareció
un fallo nuevo en la suite completa. No se alteraron módulos ajenos para hacerla
pasar.

### Comportamiento comprobado

- Roles 403, solicitud inexistente 404 y estados distintos de EN_REVISION_RH
  bloqueados. Rechazo con bitácora y sin reconocimiento ni cambios de saldo.
- Maternidad usa su recorrido por períodos; enfermedad e INS mantienen el suyo.
- Bloqueo del colaborador antes del saldo, segunda lectura tras el bloqueo,
  UPDATE condicional, una transacción compartida y repetición sin duplicados.
- Un día, períodos únicos, límites inclusivos, varios períodos, mes/año,
  febrero bisiesto y calendario incoherente sin ciclos infinitos.
- PROGRAMADO/ABIERTO/EN_REVISION dentro del plazo; cerrados, pagados y fuera del
  plazo rechazados, usando fecha calendario de Costa Rica.
- Del 2026-10-20 al 2026-11-12: **6 + 14 + 4 = 24 días** y
  **1440 + 3360 + 960 = 5760 minutos**.
- Sesenta días acreditan 2.40; con tres aportes previos identificados, solamente
  2.28. Asistencias duplicadas se deduplican; cero minutos y fechas posteriores
  al corte no se descuentan como aportes previos. Se conservan DiasUtilizados
  y FechaAcumuladaHasta.
- Un segundo INSERT fallido, actualización del saldo fallida, cualquiera de las
  bitácoras fallida o período intermedio faltante causan rollback y ausencia
  de commit. Una simulación transaccional descarta solicitud, cálculos, saldo y
  auditorías pendientes, y comprueba que se propaga la excepción original.

La simulación transaccional comprueba el flujo del código. **No es una prueba
de rollback contra SQL Server.** El usuario confirmó que no existe una base de
pruebas; no se intentó la integración real ni se ejecutó una migración.

### Trece fallos pendientes de la suite completa

- `auth.routes.test.js`: crear colaborador como administrador.
- `controllers.test.js`: crear colaborador devuelve ID y editar usa ID de ruta.
- `services.test.js`: crear colaborador con correo y opcionales.
- `vacaciones.routes.test.js`: crear vacaciones, revisión del gerente y aprobar
  con dos cálculos: tres casos.
- `vacacionesFechaSolicitud.test.js`: lunes próximo, lunes UTC que aún es
  domingo en Costa Rica y lunes próximo al cruzar el año: tres casos.
- `vacacionesResolucion.test.js`: aprobación de RH, fallo de bitácora, fallo de
  commit y creación con bitácora: cuatro casos.

Los fallos muestran simulaciones antiguas que no contemplan consultas actuales
de inicialización de saldo, incapacidades superpuestas o actualización de días
utilizados. No se consideran una verificación válida de esos recorridos hasta
actualizar sus datos de prueba; no fueron corregidos en esta revisión.

## Limitación de los aportes anteriores: demostrada, no resuelta

La implementación infiere que una fecha aportó si tiene asistencia positiva y
está hasta FechaAcumuladaHasta. Eso no es un historial de aportes reales.

Las pruebas de caracterización muestran tres resultados incorrectos posibles:

| Caso | Resultado actual | Resultado esperado bajo los datos históricos del caso |
| --- | ---: | ---: |
| Saldo manual 0 y tres asistencias positivas nunca acreditadas | 2.28 | 2.40 |
| Saldo previo 0.12 y esas asistencias después cambiadas a cero | 2.52 | 2.40 |
| Lunes trabajado y domingo ya acreditado antes de aprobar una maternidad martes–domingo | 0.32 | 0.28 |

Estas pruebas pasan porque describen explícitamente la limitación. **No indican
que esté solucionada ni que se garantice ausencia de duplicados históricos.**
La corrección del domingo en la tarea diaria evita repetirlo después de la
aprobación, pero no puede reconstruir con certeza aportes anteriores.

La alternativa mínima es guardar un historial de aportes por colaborador y fecha
cubierta, con concepto/origen, cantidad y vínculo opcional a la solicitud. Una
misma cobertura diaria debe tener unicidad compartida entre la tarea y
maternidad, para que cambiar el origen no habilite un segundo abono. Los saldos
manuales anteriores necesitarían una conciliación inicial. Ese historial no se
implementó: requiere acordar primero la ampliación del modelo.

## Presentación y alcance

React permanece sin cambios. El endpoint incluye todos los cálculos en su
respuesta y un total, pero la interfaz actual todavía no presenta los tramos
de maternidad; sus campos singulares no representan un período individual
cuando existen varios. Adaptar esa presentación queda fuera de esta tarea.

Archivos de producción modificados en esta revisión: los cinco enumerados en
Correcciones. Se añadieron cuatro archivos de pruebas y este informe; se
ajustaron los tres archivos de pruebas existentes citados arriba. La migración
008 que se había preparado fue eliminada antes de ejecutarla.
