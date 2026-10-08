# Historial ficticio para la interfaz

Ejecutar `001_historial_demo.sql` completo en SQL Server Management Studio contra
una base de pruebas `SistemaPlanilla` con las migraciones 001–005 aplicadas.
El script confirma los cambios con `COMMIT` si todas las validaciones pasan;
ante cualquier error revierte la carga completa.

## Configuración

- `@Desde = '20260101'`, `@Hasta = '20260831'`: meses completos, anteriores a hoy.
- Colaboradores: **2018, 1, 2, 3, 4 y 5**. Son IDs existentes, no años.
- `@UsuarioActorId = NULL`: selecciona un administrador o usuario de Recursos
  Humanos activo. Se puede indicar un ID explícito de uno de esos roles.
- Se requiere un gerente activo vinculado a un colaborador de cada restaurante
  con solicitudes demo; su usuario queda en `RevisadoPorGerenteId`. El actor de
  la carga queda en `RegistradoPorUsuarioId`, y `RevisadoPorRhId` queda en NULL.
- `@RespetarFechasLaborales = 1`: genera jornadas solo entre ingreso y salida.
  Si un colaborador ingresó después del rango, tendrá **cero jornadas nuevas**.
  Para generar historial ficticio anterior a su contratación en la base de
  pruebas, cambiar esta opción a `0`; esto no modifica las fechas del colaborador,
  pero las jornadas dejarán de representar su historial contractual real.

No se crean ni modifican cuentas, contraseñas, colaboradores o restaurantes.
Se utiliza el restaurante asignado actualmente a cada colaborador, porque el
esquema no contiene un historial de traslados. Para consultar como colaborador,
su cuenta debe estar vinculada al `ColaboradorId` correspondiente; el gerente
verá los datos del restaurante que tiene asignado.

## Datos generados

Con los seis colaboradores contratados durante todo el rango y sin datos previos:

| Registro | Cantidad |
| --- | ---: |
| Períodos quincenales pagados | 16 |
| Asistencias diarias | 1.250 |
| Intervalos de entrada/salida | 2.344 |
| Registros de horas extras | 477 |
| Solicitudes aprobadas o rechazadas | 558 |

Hay un descanso semanal por colaborador, jornadas entre 6 y 10 horas,
intervalos separados por una pausa de 30 minutos y 97 jornadas que cruzan
medianoche. Todos los intervalos históricos tienen salida y terminan antes
del corte de las 4 a. m. Se almacenan en UTC para mostrarse en hora de Costa Rica.

`MinutosCalculados` coincide con la suma de las marcas, `MinutosAjustados` queda
en `NULL` y las extras corresponden a `MAX(0, MinutosCalculados - 480)`, conforme
al cálculo actual del backend. Las solicitudes aprobadas autorizan esos minutos;
las rechazadas corresponden a jornadas sin extras. No se generan solicitudes
pendientes en períodos pagados.

## Registros previos y verificaciones

- Reutiliza períodos con las mismas fechas si ya están pagados y sus fechas son
  coherentes. Si hay períodos superpuestos de otra duración, revierte e indica
  que debe elegirse otro rango; no altera sus fechas ni estados.
- Omite jornadas que ya tienen asistencia **o solicitudes**. No completa ni
  corrige registros anteriores. Una segunda ejecución no duplica la carga.
- Si falta alguno de los seis colaboradores o un usuario actor válido, revierte.
- Registra los IDs nuevos en bitácora con `origen: historial_demo_001` y la fecha
  real de importación. Estos eventos identifican la carga ficticia, no simulan
  acciones históricas realizadas desde la aplicación.
- Antes del `COMMIT`, comprueba las sumas de marcas y minutos de extras.
- Al finalizar muestra las cantidades insertadas, las jornadas omitidas y el
  resultado para cada colaborador.

Para ver los datos en **Mis marcas**, entrar con el colaborador vinculado y
consultar sin filtros o usar `desde: 2026-01-01` y `hasta: 2026-08-31`.
Los períodos se crean pagados para que el historial no desplace los períodos
actuales pendientes de gestión.

Se verificaron los cálculos del generador para todo el rango predeterminado;
el script no se ejecutó contra una instancia de SQL Server durante su creación.
