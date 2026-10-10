USE SistemaPlanilla;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @UsuarioId INT = 1; -- Cambiar por tu UsuarioId.
DECLARE @InicioCalendario DATE = '20261012';
DECLARE @Hasta DATE = '20271231';

DECLARE @FechaInicio DATE = @InicioCalendario;
DECLARE @FechaFin DATE;
DECLARE @FechaLimiteAjustes DATE;
DECLARE @FechaPago DATE;

DECLARE @Creados INT = 0;
DECLARE @Existentes INT = 0;

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Verificar el usuario asociado a la creación.
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Usuarios
        WHERE UsuarioId = @UsuarioId
    )
    BEGIN
        THROW 50001,
            N'El UsuarioId indicado no existe.',
            1;
    END;

    -- 2. Generar períodos consecutivos de catorce días.
    WHILE @FechaInicio <= @Hasta
    BEGIN
        SET @FechaFin = DATEADD(DAY, 13, @FechaInicio);
        SET @FechaLimiteAjustes = DATEADD(DAY, 3, @FechaFin);
        SET @FechaPago = DATEADD(DAY, 5, @FechaFin);

        -- Si coincide exactamente, no volver a crearlo.
        IF EXISTS (
            SELECT 1
            FROM dbo.PeriodosPlanilla WITH (UPDLOCK, HOLDLOCK)
            WHERE FechaInicio = @FechaInicio
                AND FechaFin = @FechaFin
                AND FechaLimiteAjustes = @FechaLimiteAjustes
                AND FechaPago = @FechaPago
        )
        BEGIN
            SET @Existentes += 1;
        END
        ELSE
        BEGIN
            -- No permitir cruces con otros períodos existentes.
            IF EXISTS (
                SELECT 1
                FROM dbo.PeriodosPlanilla WITH (UPDLOCK, HOLDLOCK)
                WHERE FechaInicio <= @FechaFin
                    AND FechaFin >= @FechaInicio
            )
            BEGIN
                THROW 50002,
                    N'Existe un período que se superpone con el calendario. No se guardaron nuevos períodos.',
                    1;
            END;

            INSERT INTO dbo.PeriodosPlanilla (
                FechaInicio,
                FechaFin,
                FechaLimiteAjustes,
                FechaPago,
                Estado,
                CreadoPorUsuarioId
            )
            VALUES (
                @FechaInicio,
                @FechaFin,
                @FechaLimiteAjustes,
                @FechaPago,
                'PROGRAMADO',
                @UsuarioId
            );

            SET @Creados += 1;
        END;

        SET @FechaInicio = DATEADD(DAY, 14, @FechaInicio);
    END;

    COMMIT TRANSACTION;

    SELECT
        @Creados AS PeriodosCreados,
        @Existentes AS PeriodosYaExistentes;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO

-- 3. Consultar el calendario generado.
SELECT
    PeriodoId,
    FechaInicio,
    FechaFin,
    FechaLimiteAjustes,
    FechaPago,
    Estado
FROM dbo.PeriodosPlanilla
WHERE FechaInicio >= '20261012'
    AND FechaInicio <= '20271231'
ORDER BY FechaInicio;