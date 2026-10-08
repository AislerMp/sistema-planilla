/*
Datos ficticios para revisar la interfaz. Ejecutar completo en SQL Server/SSMS.
Requiere las migraciones 001 a 005 y colaboradores ya existentes.
No crea usuarios, no cambia colaboradores y no reemplaza registros existentes.
Reejecutable: solo completa jornadas que aun no existen.
Las horas se generan en Costa Rica (UTC-6) y se guardan en UTC.
*/
USE SistemaPlanilla;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

-- CONFIGURACION: rango de meses completos, anterior a la fecha actual.
DECLARE @Desde DATE = '20260101';
DECLARE @Hasta DATE = '20260831';
-- NULL elige un usuario activo de ADMINISTRADOR o RECURSOS_HUMANOS.
DECLARE @UsuarioActorId INT = NULL;
-- Mantener en 1 para no generar jornadas fuera del contrato del colaborador.
-- 0 permite historial ficticio fuera del contrato, solo para una base de pruebas.
DECLARE @RespetarFechasLaborales BIT = 1;
DECLARE @Hoy DATE = CONVERT(DATE, DATEADD(HOUR, -6, SYSUTCDATETIME()));

DECLARE @Objetivos TABLE (ColaboradorId INT PRIMARY KEY);
INSERT INTO @Objetivos VALUES (2018), (1), (2), (3), (4), (5);
DECLARE @Periodos TABLE (FechaInicio DATE PRIMARY KEY, FechaFin DATE NOT NULL);
DECLARE @PeriodosNuevos TABLE (PeriodoId INT PRIMARY KEY);
DECLARE @AsistenciasNuevas TABLE (
    AsistenciaId INT PRIMARY KEY, ColaboradorId INT, FechaAsignada DATE
);
DECLARE @ExtrasNuevas TABLE (HoraExtraId INT PRIMARY KEY);
DECLARE @SolicitudesNuevas TABLE (SolicitudId INT PRIMARY KEY);
DECLARE @MarcasInsertadas INT = 0;
DECLARE @JornadasOmitidas INT = 0;

IF @Desde IS NULL OR @Hasta IS NULL OR @Desde > @Hasta
   OR DAY(@Desde) <> 1 OR @Hasta <> EOMONTH(@Hasta)
   OR DATEDIFF(MONTH, @Desde, @Hasta) > 59
    THROW 50001, N'Indique meses completos en orden, con un maximo de cinco anios.', 1;
IF DATEADD(DAY, 4, @Hasta) >= @Hoy
    THROW 50002, N'El rango debe ser historico: su ultima fecha de pago debe ser anterior a hoy.', 1;
IF @@TRANCOUNT > 0
    THROW 50003, N'Ejecute este script fuera de otra transaccion.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    -- Impide ejecutar dos copias de esta carga simultaneamente.
    DECLARE @LockResult INT;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'SistemaPlanilla.HistorialDemo',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @LockResult < 0
        THROW 50004, N'Hay otra carga de datos demo en curso. Intente nuevamente.', 1;

    IF EXISTS (
        SELECT 1 FROM @Objetivos o
        LEFT JOIN dbo.Colaboradores c ON c.ColaboradorId = o.ColaboradorId
        WHERE c.ColaboradorId IS NULL
    )
    BEGIN
        SELECT o.ColaboradorId AS ColaboradorFaltante FROM @Objetivos o
        LEFT JOIN dbo.Colaboradores c ON c.ColaboradorId = o.ColaboradorId
        WHERE c.ColaboradorId IS NULL;
        THROW 50005, N'Faltan colaboradores. Revise los IDs indicados; no se inserto ningun dato.', 1;
    END;

    IF @UsuarioActorId IS NULL
        SELECT TOP (1) @UsuarioActorId = u.UsuarioId
        FROM dbo.Usuarios u JOIN dbo.Roles r ON r.RolId = u.RolId
        WHERE u.Activo = 1 AND r.Codigo IN ('ADMINISTRADOR', 'RECURSOS_HUMANOS')
        ORDER BY CASE WHEN r.Codigo = 'ADMINISTRADOR' THEN 0 ELSE 1 END, u.UsuarioId;
    IF NOT EXISTS (
        SELECT 1 FROM dbo.Usuarios u JOIN dbo.Roles r ON r.RolId = u.RolId
        WHERE u.UsuarioId = @UsuarioActorId AND u.Activo = 1
          AND r.Codigo IN ('ADMINISTRADOR', 'RECURSOS_HUMANOS')
    )
        THROW 50006, N'Se necesita un usuario activo de Administracion o Recursos Humanos.', 1;

    DECLARE @Mes DATE = @Desde;
    WHILE @Mes <= @Hasta
    BEGIN
        INSERT INTO @Periodos VALUES
            (@Mes, DATEADD(DAY, 14, @Mes)),
            (DATEADD(DAY, 15, @Mes), EOMONTH(@Mes));
        SET @Mes = DATEADD(MONTH, 1, @Mes);
    END;

    -- Se reutilizan periodos identicos; nunca se crean periodos superpuestos.
    IF EXISTS (
        SELECT 1 FROM @Periodos p
        JOIN dbo.PeriodosPlanilla e WITH (UPDLOCK, HOLDLOCK)
          ON e.FechaInicio <= p.FechaFin AND e.FechaFin >= p.FechaInicio
        WHERE e.FechaInicio <> p.FechaInicio OR e.FechaFin <> p.FechaFin
    )
        THROW 50007, N'El rango se superpone con periodos de otra duracion. Elija meses sin esos periodos.', 1;
    IF EXISTS (
        SELECT p.FechaInicio FROM @Periodos p
        JOIN dbo.PeriodosPlanilla e ON e.FechaInicio = p.FechaInicio AND e.FechaFin = p.FechaFin
        GROUP BY p.FechaInicio HAVING COUNT(*) > 1
    )
        THROW 50008, N'Hay periodos duplicados en el rango. Corrijalos antes de cargar el historial.', 1;
    IF EXISTS (
        SELECT 1 FROM @Periodos p
        JOIN dbo.PeriodosPlanilla e ON e.FechaInicio = p.FechaInicio AND e.FechaFin = p.FechaFin
        WHERE e.Estado <> 'PAGADO' OR e.FechaLimiteAjustes < e.FechaFin
           OR e.FechaPago <= e.FechaLimiteAjustes OR e.FechaPago >= @Hoy
    )
        THROW 50009, N'Los periodos existentes del rango deben estar pagados y tener fechas historicas coherentes.', 1;

    INSERT INTO dbo.PeriodosPlanilla (
        FechaInicio, FechaFin, FechaPago, FechaLimiteAjustes,
        Estado, CreadoPorUsuarioId, FechaCreacion
    )
    OUTPUT INSERTED.PeriodoId INTO @PeriodosNuevos
    SELECT p.FechaInicio, p.FechaFin, DATEADD(DAY, 4, p.FechaFin),
           DATEADD(DAY, 2, p.FechaFin), 'PAGADO', @UsuarioActorId,
           DATEADD(HOUR, 14, CONVERT(DATETIME2(0), DATEADD(DAY, -3, p.FechaInicio)))
    FROM @Periodos p
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.PeriodosPlanilla e
        WHERE e.FechaInicio = p.FechaInicio AND e.FechaFin = p.FechaFin
    );

    CREATE TABLE #JornadasDemo (
        ColaboradorId INT, FechaAsignada DATE, RestauranteId INT, PeriodoId INT,
        Minutos INT, EntradaUTC DATETIME2(0), Intervalos TINYINT,
        PRIMARY KEY (ColaboradorId, FechaAsignada)
    );
    ;WITH Dias AS (
        SELECT @Desde AS Fecha
        UNION ALL SELECT DATEADD(DAY, 1, Fecha) FROM Dias WHERE Fecha < @Hasta
    )
    INSERT INTO #JornadasDemo
    SELECT c.ColaboradorId, d.Fecha, c.RestauranteId, p.PeriodoId,
           m.Minutos,
           DATEADD(HOUR, 6 + CASE WHEN n.Numero % 11 = 0 THEN 17
                                 ELSE 8 + c.ColaboradorId % 3 END,
                   CONVERT(DATETIME2(0), d.Fecha)),
           CASE WHEN m.Minutos = 360 THEN 1 ELSE 2 END
    FROM Dias d CROSS JOIN @Objetivos o
    JOIN dbo.Colaboradores c ON c.ColaboradorId = o.ColaboradorId
    JOIN dbo.PeriodosPlanilla p ON d.Fecha BETWEEN p.FechaInicio AND p.FechaFin
    CROSS APPLY (SELECT DATEDIFF(DAY, CONVERT(DATE, '20000101'), d.Fecha)
                        + c.ColaboradorId AS Numero) n
    CROSS APPLY (SELECT CASE n.Numero % 8
        WHEN 0 THEN 360 WHEN 1 THEN 420 WHEN 2 THEN 450
        WHEN 3 THEN 480 WHEN 4 THEN 480 WHEN 5 THEN 510
        WHEN 6 THEN 540 ELSE 600 END AS Minutos) m
    WHERE n.Numero % 7 <> 0 -- Un descanso semanal, distribuido por colaborador.
      AND (@RespetarFechasLaborales = 0 OR (
          d.Fecha >= c.FechaIngreso AND (c.FechaSalida IS NULL OR d.Fecha <= c.FechaSalida)
      ))
    OPTION (MAXRECURSION 0);

    SELECT @JornadasOmitidas = COUNT(*) FROM #JornadasDemo j
    WHERE EXISTS (
        SELECT 1 FROM dbo.AsistenciasDiarias a
        WHERE a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.FechaAsignada
    ) OR EXISTS (
        SELECT 1 FROM dbo.SolicitudesHorasExtras d
        JOIN dbo.Solicitudes s ON s.SolicitudId = d.SolicitudId
        WHERE s.TipoSolicitud = 'HORAS_EXTRAS'
          AND s.ColaboradorId = j.ColaboradorId AND d.FechaSolicitada = j.FechaAsignada
    );

    INSERT INTO dbo.AsistenciasDiarias (
        ColaboradorId, RestauranteId, PeriodoId, FechaAsignada,
        MinutosCalculados, MinutosAjustados, FechaCreacion
    )
    OUTPUT INSERTED.AsistenciaId, INSERTED.ColaboradorId, INSERTED.FechaAsignada
        INTO @AsistenciasNuevas
    SELECT j.ColaboradorId, j.RestauranteId, j.PeriodoId, j.FechaAsignada,
           j.Minutos, NULL, j.EntradaUTC
    FROM #JornadasDemo j
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.AsistenciasDiarias a WITH (UPDLOCK, HOLDLOCK)
        WHERE a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.FechaAsignada
    ) AND NOT EXISTS (
        -- No inventar una jornada que contradiga solicitudes ya registradas.
        SELECT 1 FROM dbo.SolicitudesHorasExtras d WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.Solicitudes s WITH (UPDLOCK, HOLDLOCK) ON s.SolicitudId = d.SolicitudId
        WHERE s.TipoSolicitud = 'HORAS_EXTRAS'
          AND s.ColaboradorId = j.ColaboradorId AND d.FechaSolicitada = j.FechaAsignada
    );

    -- Dos intervalos separados por 30 min sin contabilizar; jornadas cortas: uno.
    INSERT INTO dbo.MarcasAsistencia (
        ColaboradorId, FechaAsignada, NumeroIntervalo, FechaHoraEntrada, FechaHoraSalida
    )
    SELECT j.ColaboradorId, j.FechaAsignada, v.Numero,
           DATEADD(MINUTE, CASE WHEN v.Numero = 1 THEN 0 ELSE 270 END, j.EntradaUTC),
           DATEADD(MINUTE, CASE WHEN j.Intervalos = 1 THEN j.Minutos
                               WHEN v.Numero = 1 THEN 240 ELSE j.Minutos + 30 END, j.EntradaUTC)
    FROM #JornadasDemo j
    JOIN @AsistenciasNuevas a ON a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.FechaAsignada
    CROSS JOIN (VALUES (1), (2)) v(Numero)
    WHERE v.Numero <= j.Intervalos;
    SET @MarcasInsertadas = @@ROWCOUNT;

    INSERT INTO dbo.HorasExtras (AsistenciaId, MinutosDetectados)
    OUTPUT INSERTED.HoraExtraId INTO @ExtrasNuevas
    SELECT a.AsistenciaId, j.Minutos - 480 FROM #JornadasDemo j
    JOIN @AsistenciasNuevas a ON a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.FechaAsignada
    WHERE j.Minutos > 480;

    -- La carga se coordina con el mismo bloqueo usado por las creaciones del backend.
    DECLARE @ColaboradoresBloqueados TABLE (ColaboradorId INT PRIMARY KEY);
    INSERT INTO @ColaboradoresBloqueados
    SELECT c.ColaboradorId FROM dbo.Colaboradores c WITH (UPDLOCK, HOLDLOCK)
    JOIN @Objetivos o ON o.ColaboradorId = c.ColaboradorId;

    -- Cada cabecera obtiene su ID; luego se inserta su detalle en esta transaccion.
    DECLARE @SolicitudesDemo TABLE (
        Numero INT IDENTITY PRIMARY KEY, ColaboradorId INT, RestauranteId INT,
        FechaSolicitada DATE, MinutosSolicitados INT, MinutosAutorizados INT,
        Estado VARCHAR(20), GerenteId INT
    );
    INSERT INTO @SolicitudesDemo
    SELECT j.ColaboradorId, j.RestauranteId, j.FechaAsignada,
        CASE WHEN j.Minutos > 480 THEN j.Minutos - 480 ELSE 60 END,
        CASE WHEN j.Minutos > 480 THEN j.Minutos - 480 ELSE 0 END,
        CASE WHEN j.Minutos > 480 THEN 'APROBADA' ELSE 'RECHAZADA' END,
        gerente.UsuarioId
    FROM #JornadasDemo j
    JOIN @AsistenciasNuevas a ON a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.FechaAsignada
    OUTER APPLY (
        SELECT TOP (1) u.UsuarioId
        FROM dbo.Usuarios u JOIN dbo.Roles r ON r.RolId = u.RolId
        JOIN dbo.Colaboradores c ON c.ColaboradorId = u.ColaboradorId
        WHERE r.Codigo = 'GERENTE' AND u.Activo = 1 AND c.Activo = 1
          AND c.RestauranteId = j.RestauranteId
        ORDER BY u.UsuarioId
    ) gerente
    WHERE (j.Minutos > 480 OR (DAY(j.FechaAsignada) + j.ColaboradorId) % 9 = 0)
      AND NOT EXISTS (
        SELECT 1 FROM dbo.SolicitudesHorasExtras d
        JOIN dbo.Solicitudes s ON s.SolicitudId = d.SolicitudId
        WHERE s.TipoSolicitud = 'HORAS_EXTRAS' AND s.ColaboradorId = j.ColaboradorId
          AND d.FechaSolicitada = j.FechaAsignada
      );
    IF EXISTS (SELECT 1 FROM @SolicitudesDemo WHERE GerenteId IS NULL)
        THROW 50011, N'Se necesita un gerente activo por restaurante para las solicitudes demo resueltas.', 1;

    DECLARE @Numero INT = 1;
    DECLARE @CantidadSolicitudes INT = (SELECT COUNT(*) FROM @SolicitudesDemo);
    DECLARE @SolicitudId INT;
    WHILE @Numero <= @CantidadSolicitudes
    BEGIN
        INSERT INTO dbo.Solicitudes (
            TipoSolicitud, ColaboradorId, RestauranteId, RegistradoPorUsuarioId,
            Motivo, Estado, RevisadoPorGerenteId, Observacion
        )
        OUTPUT INSERTED.SolicitudId INTO @SolicitudesNuevas
        SELECT 'HORAS_EXTRAS', ColaboradorId, RestauranteId, @UsuarioActorId,
            N'[DEMO HISTORIAL] Apoyo de cierre e inventario.', Estado, GerenteId,
            CASE WHEN Estado = 'APROBADA' THEN N'[DEMO HISTORIAL] Apoyo autorizado y realizado.'
                 ELSE N'[DEMO HISTORIAL] Se cubrio la operacion dentro de la jornada.' END
        FROM @SolicitudesDemo WHERE Numero = @Numero;
        SET @SolicitudId = CONVERT(INT, SCOPE_IDENTITY());

        INSERT INTO dbo.SolicitudesHorasExtras (
            SolicitudId, FechaSolicitada, MinutosSolicitados, MinutosAutorizados
        )
        SELECT @SolicitudId, FechaSolicitada, MinutosSolicitados, MinutosAutorizados
        FROM @SolicitudesDemo WHERE Numero = @Numero;
        SET @Numero += 1;
    END;

    -- Auditoria de la carga actual, identificada como demo (no simula eventos reales).
    INSERT INTO dbo.Bitacora (UsuarioId, Entidad, RegistroId, Accion, DatosAnteriores, DatosNuevos)
    SELECT @UsuarioActorId, x.Entidad, x.RegistroId, 'CREAR', NULL,
        (SELECT 'historial_demo_001' AS origen, x.RegistroId AS registroId,
                @Desde AS desde, @Hasta AS hasta FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM (
        SELECT N'PeriodosPlanilla' AS Entidad, PeriodoId AS RegistroId FROM @PeriodosNuevos
        UNION ALL SELECT N'AsistenciasDiarias', AsistenciaId FROM @AsistenciasNuevas
        UNION ALL SELECT N'HorasExtras', HoraExtraId FROM @ExtrasNuevas
        UNION ALL SELECT N'Solicitudes', SolicitudId FROM @SolicitudesNuevas
    ) x;

    -- Comprobar la coherencia antes de confirmar, solo sobre jornadas nuevas.
    IF EXISTS (
        SELECT 1 FROM @AsistenciasNuevas n
        JOIN dbo.AsistenciasDiarias a ON a.AsistenciaId = n.AsistenciaId
        CROSS APPLY (
            SELECT SUM(DATEDIFF(MINUTE, m.FechaHoraEntrada, m.FechaHoraSalida)) AS Total
            FROM dbo.MarcasAsistencia m
            WHERE m.ColaboradorId = a.ColaboradorId AND m.FechaAsignada = a.FechaAsignada
        ) t
        LEFT JOIN dbo.HorasExtras h ON h.AsistenciaId = a.AsistenciaId
        WHERE t.Total IS NULL OR t.Total <> a.MinutosCalculados
           OR COALESCE(h.MinutosDetectados, 0) <>
              CASE WHEN a.MinutosCalculados > 480 THEN a.MinutosCalculados - 480 ELSE 0 END
    )
        THROW 50010, N'La verificacion de minutos fallo. Se revierte toda la carga.', 1;

    COMMIT TRANSACTION;

    SELECT @Desde AS Desde, @Hasta AS Hasta, @UsuarioActorId AS UsuarioDeCarga,
        (SELECT COUNT(*) FROM @PeriodosNuevos) AS PeriodosCreados,
        (SELECT COUNT(*) FROM @AsistenciasNuevas) AS AsistenciasCreadas,
        @MarcasInsertadas AS MarcasCreadas,
        (SELECT COUNT(*) FROM @ExtrasNuevas) AS RegistrosExtrasCreados,
        (SELECT COUNT(*) FROM @SolicitudesNuevas) AS SolicitudesCreadas,
        @JornadasOmitidas AS JornadasExistentesOmitidas;

    SELECT c.ColaboradorId, c.Nombres, c.Apellidos, c.FechaIngreso, c.FechaSalida,
           c.RestauranteId, COUNT(n.AsistenciaId) AS JornadasNuevas,
           CASE WHEN COUNT(n.AsistenciaId) = 0
                THEN N'Sin jornadas nuevas: revise fechas laborales y registros existentes.'
                ELSE N'Historial creado.' END AS Resultado
    FROM @Objetivos o JOIN dbo.Colaboradores c ON c.ColaboradorId = o.ColaboradorId
    LEFT JOIN @AsistenciasNuevas n ON n.ColaboradorId = c.ColaboradorId
    GROUP BY c.ColaboradorId, c.Nombres, c.Apellidos, c.FechaIngreso, c.FechaSalida, c.RestauranteId
    ORDER BY c.ColaboradorId;
    DROP TABLE #JornadasDemo;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    IF OBJECT_ID('tempdb..#JornadasDemo') IS NOT NULL DROP TABLE #JornadasDemo;
    THROW;
END CATCH;
GO
