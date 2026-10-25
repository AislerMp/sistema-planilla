USE SistemaPlanilla;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Esta migración se ejecuta una sola vez.
IF OBJECT_ID(N'dbo.AsistenciasDiarias', N'U') IS NULL
    THROW 50001, N'No existe la tabla AsistenciasDiarias.', 1;

IF COL_LENGTH(N'dbo.AsistenciasDiarias', N'TipoJornada') IS NOT NULL
   OR OBJECT_ID(N'dbo.Feriados', N'U') IS NOT NULL
    THROW 50002,
        N'La columna TipoJornada o la tabla Feriados ya existe. No se realizaron cambios.',
        1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Clasificación de la jornada.
    -- NULL significa que la asistencia todavía no se ha clasificado.
    -- No se cambian los minutos ni se clasifican registros históricos.
    ALTER TABLE dbo.AsistenciasDiarias
        ADD TipoJornada VARCHAR(8) NULL
            CONSTRAINT CK_AsistenciasDiarias_TipoJornada
            CHECK (
                TipoJornada IS NULL
                OR TipoJornada IN ('DIURNA', 'MIXTA', 'NOCTURNA')
            );

    -- 2. Catálogo de feriados por fecha concreta.
    CREATE TABLE dbo.Feriados (
        FeriadoId INT IDENTITY(1,1) NOT NULL,
        Fecha DATE NOT NULL,
        Nombre NVARCHAR(100) NOT NULL,

        CONSTRAINT PK_Feriados
            PRIMARY KEY (FeriadoId),

        CONSTRAINT UQ_Feriados_Fecha
            UNIQUE (Fecha),

        CONSTRAINT CK_Feriados_Nombre
            CHECK (LEN(LTRIM(RTRIM(Nombre))) > 0)
    );

    -- 3. Calendario inicial: feriados nacionales de Costa Rica, 2026.
    -- Fuente: calendario oficial del MTSS para 2026.
    -- https://www.mtss.go.cr/temas-laborales/feriados/feriados_calendario_2026.pdf
    -- Cada año necesita sus propias fechas, incluida Semana Santa.
    INSERT INTO dbo.Feriados (Fecha, Nombre)
    VALUES
        ('20260101', N'Año Nuevo'),
        ('20260402', N'Jueves Santo'),
        ('20260403', N'Viernes Santo'),
        ('20260411', N'Día de Juan Santamaría'),
        ('20260501', N'Día Internacional del Trabajo'),
        ('20260725', N'Anexión del Partido de Nicoya'),
        ('20260802', N'Día de la Virgen de los Ángeles'),
        ('20260815', N'Día de la Madre'),
        ('20260831', N'Día de la Persona Negra y la Cultura Afrocostarricense'),
        ('20260915', N'Día de la Independencia'),
        ('20261201', N'Día de la Abolición del Ejército'),
        ('20261225', N'Navidad');

    COMMIT TRANSACTION;

    PRINT N'Clasificación de jornadas y catálogo de feriados creados correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO

-- Consultas de verificación.
SELECT
    FeriadoId,
    Fecha,
    Nombre
FROM dbo.Feriados
ORDER BY Fecha;

SELECT
    TipoJornada,
    COUNT(*) AS CantidadAsistencias
FROM dbo.AsistenciasDiarias
GROUP BY TipoJornada;
GO

