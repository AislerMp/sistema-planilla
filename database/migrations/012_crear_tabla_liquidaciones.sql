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

IF OBJECT_ID(N'dbo.Colaboradores', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Restaurantes', N'U') IS NULL
   OR OBJECT_ID(N'dbo.DetallesPlanilla', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
    THROW 50001,
        N'Falta una tabla requerida para crear Liquidaciones.',
        1;

IF OBJECT_ID(N'dbo.Liquidaciones', N'U') IS NOT NULL
    THROW 50002,
        N'La tabla Liquidaciones ya existe. No se realizaron cambios.',
        1;

BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE dbo.Liquidaciones (
        LiquidacionId INT IDENTITY(1,1) NOT NULL,
        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,

        -- Se vincula al detalle normal del colaborador cuando este se registra.
        DetallePlanillaId INT NULL,

        MotivoSalida VARCHAR(40) NOT NULL,
        FechaSalida DATE NOT NULL,

        DiasVacacionesPagados DECIMAL(8,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_DiasVacaciones
            DEFAULT (0),

        DiasPreavisoPagados DECIMAL(8,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_DiasPreaviso
            DEFAULT (0),

        DiasCesantiaPagados DECIMAL(8,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_DiasCesantia
            DEFAULT (0),

        MontoVacaciones DECIMAL(14,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_MontoVacaciones
            DEFAULT (0),

        MontoAguinaldo DECIMAL(14,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_MontoAguinaldo
            DEFAULT (0),

        MontoPreaviso DECIMAL(14,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_MontoPreaviso
            DEFAULT (0),

        MontoCesantia DECIMAL(14,2) NOT NULL
            CONSTRAINT DF_Liquidaciones_MontoCesantia
            DEFAULT (0),

        TotalLiquidacion AS (
            CAST(
                MontoVacaciones
                + MontoAguinaldo
                + MontoPreaviso
                + MontoCesantia
                AS DECIMAL(14,2)
            )
        ) PERSISTED,

        RegistradoPorUsuarioId INT NOT NULL,

        Observacion NVARCHAR(500) NULL,

        CONSTRAINT PK_Liquidaciones
            PRIMARY KEY (LiquidacionId),

        CONSTRAINT FK_Liquidaciones_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_Liquidaciones_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT FK_Liquidaciones_DetallesPlanilla
            FOREIGN KEY (DetallePlanillaId)
            REFERENCES dbo.DetallesPlanilla(DetallePlanillaId),

        CONSTRAINT FK_Liquidaciones_Usuarios
            FOREIGN KEY (RegistradoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        -- Evita registrar dos liquidaciones para la misma salida.
        CONSTRAINT UQ_Liquidaciones_Colaborador_FechaSalida
            UNIQUE (ColaboradorId, FechaSalida),

        CONSTRAINT CK_Liquidaciones_MotivoSalida
            CHECK (
                MotivoSalida IN (
                    'RENUNCIA',
                    'DESPIDO_CON_RESPONSABILIDAD',
                    'DESPIDO_SIN_RESPONSABILIDAD'
                )
            ),

        CONSTRAINT CK_Liquidaciones_Dias
            CHECK (
                DiasVacacionesPagados >= 0
                AND DiasPreavisoPagados >= 0
                AND DiasCesantiaPagados >= 0
            ),

        CONSTRAINT CK_Liquidaciones_Montos
            CHECK (
                MontoVacaciones >= 0
                AND MontoAguinaldo >= 0
                AND MontoPreaviso >= 0
                AND MontoCesantia >= 0
            )
    );

    CREATE INDEX IX_Liquidaciones_Restaurante_FechaSalida
        ON dbo.Liquidaciones (
            RestauranteId,
            FechaSalida
        );

    CREATE INDEX IX_Liquidaciones_DetallePlanilla
        ON dbo.Liquidaciones (DetallePlanillaId);

    COMMIT TRANSACTION;

    PRINT N'Tabla Liquidaciones creada correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
