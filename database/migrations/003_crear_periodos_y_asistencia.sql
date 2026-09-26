USE SistemaPlanilla;
GO

-- Configuración necesaria para crear los índices y restricciones.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Evitamos ejecutar accidentalmente la misma migración dos veces.
IF OBJECT_ID(N'dbo.PeriodosPlanilla', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.AsistenciasDiarias', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.MarcasAsistencia', N'U') IS NOT NULL
BEGIN
    THROW 50001,
        N'Ya existe alguna de las tablas de esta migración. No se modificó ninguna tabla.',
        1;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    ------------------------------------------------------------
    -- 1. PERÍODOS DE PLANILLA
    ------------------------------------------------------------

    CREATE TABLE dbo.PeriodosPlanilla (
        PeriodoId INT IDENTITY(1,1) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,
        FechaPago DATE NOT NULL,

        -- Instante guardado en UTC.
        FechaLimiteAjustes DATE NOT NULL,

        Estado VARCHAR(15) NOT NULL
            CONSTRAINT DF_PeriodosPlanilla_Estado
            DEFAULT ('ABIERTO'),

        CreadoPorUsuarioId INT NOT NULL,

        FechaCreacion DATETIME2(0) NOT NULL
            CONSTRAINT DF_PeriodosPlanilla_FechaCreacion
            DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_PeriodosPlanilla
            PRIMARY KEY (PeriodoId),

        CONSTRAINT FK_PeriodosPlanilla_Usuarios
            FOREIGN KEY (CreadoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT CK_PeriodosPlanilla_Fechas
            CHECK (FechaInicio <= FechaFin),

        CONSTRAINT CK_PeriodosPlanilla_FechaPago
            CHECK (FechaPago >= FechaFin),

        CONSTRAINT CK_PeriodosPlanilla_Estado
            CHECK (
                Estado IN (
                    'ABIERTO',
                    'EN_REVISION',
                    'CERRADO',
                    'PAGADO'
                )
            )
    );

    ------------------------------------------------------------
    -- 2. ASISTENCIA DIARIA
    ------------------------------------------------------------

    CREATE TABLE dbo.AsistenciasDiarias (
        AsistenciaId INT IDENTITY(1,1) NOT NULL,
        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,
        PeriodoId INT NOT NULL,
        FechaAsignada DATE NOT NULL,

        MinutosCalculados INT NOT NULL
            CONSTRAINT DF_AsistenciasDiarias_MinutosCalculados
            DEFAULT (0),

        -- NULL significa que el gerente no ha aplicado un ajuste.
        MinutosAjustados INT NULL,

        FechaCreacion DATETIME2(0) NOT NULL
            CONSTRAINT DF_AsistenciasDiarias_FechaCreacion
            DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_AsistenciasDiarias
            PRIMARY KEY (AsistenciaId),

        CONSTRAINT FK_AsistenciasDiarias_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_AsistenciasDiarias_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT FK_AsistenciasDiarias_PeriodosPlanilla
            FOREIGN KEY (PeriodoId)
            REFERENCES dbo.PeriodosPlanilla(PeriodoId),

        -- Solo un total diario por colaborador y fecha asignada.
        CONSTRAINT UQ_AsistenciasDiarias_Colaborador_Fecha
            UNIQUE (ColaboradorId, FechaAsignada),

        CONSTRAINT CK_AsistenciasDiarias_MinutosCalculados
            CHECK (MinutosCalculados >= 0),

        CONSTRAINT CK_AsistenciasDiarias_MinutosAjustados
            CHECK (
                MinutosAjustados IS NULL
                OR MinutosAjustados >= 0
            )
    );

    ------------------------------------------------------------
    -- 3. PAREJAS DE ENTRADA Y SALIDA
    ------------------------------------------------------------

    CREATE TABLE dbo.MarcasAsistencia (
        MarcaId INT IDENTITY(1,1) NOT NULL,
        ColaboradorId INT NOT NULL,
        FechaAsignada DATE NOT NULL,
        NumeroIntervalo TINYINT NOT NULL,

        -- La entrada usa la hora del servidor de base de datos.
        FechaHoraEntrada DATETIME2(0) NOT NULL
            CONSTRAINT DF_MarcasAsistencia_FechaHoraEntrada
            DEFAULT (SYSUTCDATETIME()),

        -- La salida queda vacía hasta que el colaborador marque.
        FechaHoraSalida DATETIME2(0) NULL,

        CONSTRAINT PK_MarcasAsistencia
            PRIMARY KEY (MarcaId),

        -- La pareja debe pertenecer a una asistencia diaria existente.
        CONSTRAINT FK_MarcasAsistencia_AsistenciasDiarias
            FOREIGN KEY (ColaboradorId, FechaAsignada)
            REFERENCES dbo.AsistenciasDiarias (
                ColaboradorId,
                FechaAsignada
            ),

        -- Solo puede existir la primera o la segunda pareja.
        CONSTRAINT CK_MarcasAsistencia_NumeroIntervalo
            CHECK (NumeroIntervalo IN (1, 2)),

        -- No se puede repetir el número de pareja del mismo día.
        CONSTRAINT UQ_MarcasAsistencia_Colaborador_Fecha_Intervalo
            UNIQUE (
                ColaboradorId,
                FechaAsignada,
                NumeroIntervalo
            ),

        CONSTRAINT CK_MarcasAsistencia_OrdenFechas
            CHECK (
                FechaHoraSalida IS NULL
                OR FechaHoraSalida >= FechaHoraEntrada
            )
    );


    CREATE TABLE dbo.HorasExtras (
        HoraExtraId INT IDENTITY(1,1) NOT NULL,
        AsistenciaId INT NOT NULL,
        MinutosDetectados INT NOT NULL,

        CONSTRAINT PK_HorasExtras
            PRIMARY KEY (HoraExtraId),

        CONSTRAINT FK_HorasExtras_AsistenciasDiarias
            FOREIGN KEY (AsistenciaId)
            REFERENCES dbo.AsistenciasDiarias(AsistenciaId),

        CONSTRAINT UQ_HorasExtras_Asistencia
            UNIQUE (AsistenciaId),

        CONSTRAINT CK_HorasExtras_MinutosDetectados
            CHECK (MinutosDetectados >= 0)
    );

    CREATE TABLE dbo.SolicitudesHorasExtras (
        SolicitudHoraExtraId INT IDENTITY(1,1) NOT NULL,

        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,
        FechaSolicitada DATE NOT NULL,

        MinutosSolicitados INT NOT NULL,
        Motivo NVARCHAR(500) NOT NULL,

        Estado VARCHAR(15) NOT NULL
            CONSTRAINT DF_SolicitudesHorasExtras_Estado
            DEFAULT ('PENDIENTE'),

        MinutosAutorizados INT NULL,
        RevisadoPorUsuarioId INT NULL,
        Observacion NVARCHAR(500) NULL,

        CONSTRAINT PK_SolicitudesHorasExtras
            PRIMARY KEY (SolicitudHoraExtraId),

        CONSTRAINT FK_SolicitudesHorasExtras_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_SolicitudesHorasExtras_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT FK_SolicitudesHorasExtras_Usuarios
            FOREIGN KEY (RevisadoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT CK_SolicitudesHorasExtras_MinutosSolicitados
            CHECK (MinutosSolicitados > 0),

        CONSTRAINT CK_SolicitudesHorasExtras_Motivo
            CHECK (LEN(LTRIM(RTRIM(Motivo))) > 0),

        CONSTRAINT CK_SolicitudesHorasExtras_MinutosAutorizados
            CHECK (
                MinutosAutorizados IS NULL
                OR MinutosAutorizados BETWEEN 0 AND MinutosSolicitados
            ),

        CONSTRAINT CK_SolicitudesHorasExtras_Estado
            CHECK (
                Estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')
            ),

        CONSTRAINT CK_SolicitudesHorasExtras_Revision
            CHECK (
                (
                    Estado = 'PENDIENTE'
                    AND MinutosAutorizados IS NULL
                    AND RevisadoPorUsuarioId IS NULL
                )
                OR
                (
                    Estado = 'APROBADA'
                    AND MinutosAutorizados IS NOT NULL
                    AND MinutosAutorizados > 0
                    AND RevisadoPorUsuarioId IS NOT NULL
                )
                OR
                (
                    Estado = 'RECHAZADA'
                    AND MinutosAutorizados IS NOT NULL
                    AND MinutosAutorizados = 0
                    AND RevisadoPorUsuarioId IS NOT NULL
                )
            )
    );

    ------------------------------------------------------------
    -- 4. SOLO UNA PAREJA PENDIENTE POR COLABORADOR Y DÍA
    ------------------------------------------------------------

    CREATE UNIQUE INDEX UX_MarcasAsistencia_Pendiente
        ON dbo.MarcasAsistencia (
            ColaboradorId,
            FechaAsignada
        )
        WHERE FechaHoraSalida IS NULL;

    ------------------------------------------------------------
    -- 5. ÍNDICES PARA LAS CONSULTAS DEL GERENTE
    ------------------------------------------------------------

    CREATE INDEX IX_AsistenciasDiarias_Restaurante_Fecha
        ON dbo.AsistenciasDiarias (
            RestauranteId,
            FechaAsignada
        );

    CREATE INDEX IX_AsistenciasDiarias_Periodo_Restaurante
        ON dbo.AsistenciasDiarias (
            PeriodoId,
            RestauranteId
        );

    COMMIT TRANSACTION;

    PRINT N'Tablas de períodos y asistencia creadas correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO