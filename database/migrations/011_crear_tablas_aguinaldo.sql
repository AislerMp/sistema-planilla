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

-- Tablas existentes que necesita esta migración.
IF OBJECT_ID(N'dbo.ConceptosPlanilla', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Colaboradores', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Restaurantes', N'U') IS NULL
    THROW 50001,
        N'Falta una tabla requerida para crear el módulo de aguinaldo.',
        1;

-- Esta migración se ejecuta una sola vez.
IF OBJECT_ID(N'dbo.Aguinaldos', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.DetallesAguinaldo', N'U') IS NOT NULL
    THROW 50002,
        N'Ya existe alguna de las tablas de aguinaldo. No se realizaron cambios.',
        1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- 2. Cabecera del cálculo anual.
    CREATE TABLE dbo.Aguinaldos (
        AguinaldoId INT IDENTITY(1,1) NOT NULL,
        Anio INT NOT NULL,

        Estado VARCHAR(15) NOT NULL
            CONSTRAINT DF_Aguinaldos_Estado
            DEFAULT ('PENDIENTE'),

        TotalAguinaldo DECIMAL(14,2) NOT NULL
            CONSTRAINT DF_Aguinaldos_Total
            DEFAULT (0),

        RegistradoPorUsuarioId INT NOT NULL,

        CONSTRAINT PK_Aguinaldos
            PRIMARY KEY (AguinaldoId),

        CONSTRAINT UQ_Aguinaldos_Anio
            UNIQUE (Anio),

        CONSTRAINT FK_Aguinaldos_Usuarios
            FOREIGN KEY (RegistradoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT CK_Aguinaldos_Anio
            CHECK (Anio BETWEEN 1900 AND 9999),

        CONSTRAINT CK_Aguinaldos_Estado
            CHECK (
                Estado IN ('PENDIENTE', 'CONFIRMADO')
            ),

        CONSTRAINT CK_Aguinaldos_Total
            CHECK (TotalAguinaldo >= 0)
    );

    -- 3. Resultado individual de cada colaborador.
    CREATE TABLE dbo.DetallesAguinaldo (
        DetalleAguinaldoId INT IDENTITY(1,1) NOT NULL,
        AguinaldoId INT NOT NULL,
        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,

        SalarioAcumulado DECIMAL(14,2) NOT NULL,
        MontoAguinaldo DECIMAL(14,2) NOT NULL,

        CONSTRAINT PK_DetallesAguinaldo
            PRIMARY KEY (DetalleAguinaldoId),

        CONSTRAINT UQ_DetallesAguinaldo_Aguinaldo_Colaborador
            UNIQUE (AguinaldoId, ColaboradorId),

        CONSTRAINT FK_DetallesAguinaldo_Aguinaldos
            FOREIGN KEY (AguinaldoId)
            REFERENCES dbo.Aguinaldos(AguinaldoId),

        CONSTRAINT FK_DetallesAguinaldo_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_DetallesAguinaldo_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT CK_DetallesAguinaldo_Montos
            CHECK (
                SalarioAcumulado >= 0
                AND MontoAguinaldo >= 0
            )
    );

    -- Consultas del historial individual.
    CREATE INDEX IX_DetallesAguinaldo_Colaborador_Aguinaldo
        ON dbo.DetallesAguinaldo (
            ColaboradorId,
            AguinaldoId
        );

    -- Consultas por restaurante.
    CREATE INDEX IX_DetallesAguinaldo_Restaurante_Aguinaldo
        ON dbo.DetallesAguinaldo (
            RestauranteId,
            AguinaldoId
        );

    COMMIT TRANSACTION;

    PRINT N'Migración de aguinaldo y mes de devengo aplicada correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO

-- Verificación de las dos tablas nuevas.
SELECT N'Aguinaldos' AS Tabla, COUNT(*) AS Registros
FROM dbo.Aguinaldos

UNION ALL

SELECT N'DetallesAguinaldo', COUNT(*)
FROM dbo.DetallesAguinaldo;
GO