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

-- Verificar las tablas que necesitamos.
IF OBJECT_ID(N'dbo.PeriodosPlanilla', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Colaboradores', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Restaurantes', N'U') IS NULL
    THROW 50001,
        N'Falta una tabla requerida: PeriodosPlanilla, Usuarios, Colaboradores o Restaurantes.',
        1;

-- Esta migración se ejecuta una sola vez.
IF OBJECT_ID(N'dbo.Planillas', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.DetallesPlanilla', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.ConceptosPlanilla', N'U') IS NOT NULL
    THROW 50002,
        N'Ya existe alguna de las tablas de planilla. No se realizaron cambios.',
        1;

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Pago general del período.
    CREATE TABLE dbo.Planillas (
        PlanillaId INT IDENTITY(1,1) NOT NULL,
        PeriodoId INT NOT NULL,
        FechaPago DATE NOT NULL,
        RegistradoPorUsuarioId INT NOT NULL,
        TotalIngresos DECIMAL(14,2) NOT NULL,
        TotalDeducciones DECIMAL(14,2) NOT NULL,
        TotalNeto DECIMAL(14,2) NOT NULL,

        CONSTRAINT PK_Planillas
            PRIMARY KEY (PlanillaId),

        CONSTRAINT UQ_Planillas_Periodo
            UNIQUE (PeriodoId),

        CONSTRAINT FK_Planillas_PeriodosPlanilla
            FOREIGN KEY (PeriodoId)
            REFERENCES dbo.PeriodosPlanilla(PeriodoId),

        CONSTRAINT FK_Planillas_Usuarios
            FOREIGN KEY (RegistradoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT CK_Planillas_Totales
            CHECK (
                TotalIngresos >= 0
                AND TotalDeducciones >= 0
                AND TotalNeto >= 0
                AND TotalNeto = TotalIngresos - TotalDeducciones
            )
    );

    -- 2. Resumen del pago de cada colaborador.
    CREATE TABLE dbo.DetallesPlanilla (
        DetallePlanillaId INT IDENTITY(1,1) NOT NULL,
        PlanillaId INT NOT NULL,
        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,
        TarifaHoraAplicada DECIMAL(12,2) NOT NULL,
        TotalIngresos DECIMAL(14,2) NOT NULL,
        TotalDeducciones DECIMAL(14,2) NOT NULL,
        TotalNeto DECIMAL(14,2) NOT NULL,

        CONSTRAINT PK_DetallesPlanilla
            PRIMARY KEY (DetallePlanillaId),

        CONSTRAINT UQ_DetallesPlanilla_Planilla_Colaborador
            UNIQUE (PlanillaId, ColaboradorId),

        CONSTRAINT FK_DetallesPlanilla_Planillas
            FOREIGN KEY (PlanillaId)
            REFERENCES dbo.Planillas(PlanillaId),

        CONSTRAINT FK_DetallesPlanilla_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_DetallesPlanilla_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT CK_DetallesPlanilla_Tarifa
            CHECK (TarifaHoraAplicada > 0),

        CONSTRAINT CK_DetallesPlanilla_Totales
            CHECK (
                TotalIngresos >= 0
                AND TotalDeducciones >= 0
                AND TotalNeto >= 0
                AND TotalNeto = TotalIngresos - TotalDeducciones
            )
    );

    -- 3. Ingresos y deducciones que explican cada pago.
    CREATE TABLE dbo.ConceptosPlanilla (
        ConceptoPlanillaId INT IDENTITY(1,1) NOT NULL,
        DetallePlanillaId INT NOT NULL,
        TipoConcepto VARCHAR(10) NOT NULL,
        CodigoConcepto VARCHAR(50) NOT NULL,
        TipoJornada VARCHAR(8) NULL,
        Minutos INT NULL,
        FactorAplicado DECIMAL(10,6) NOT NULL,
        Monto DECIMAL(14,2) NOT NULL,

        CONSTRAINT PK_ConceptosPlanilla
            PRIMARY KEY (ConceptoPlanillaId),

        CONSTRAINT FK_ConceptosPlanilla_DetallesPlanilla
            FOREIGN KEY (DetallePlanillaId)
            REFERENCES dbo.DetallesPlanilla(DetallePlanillaId),

        CONSTRAINT CK_ConceptosPlanilla_Tipo
            CHECK (TipoConcepto IN ('INGRESO', 'DEDUCCION')),

        CONSTRAINT CK_ConceptosPlanilla_Codigo
            CHECK (LEN(LTRIM(RTRIM(CodigoConcepto))) > 0),

        CONSTRAINT CK_ConceptosPlanilla_Jornada
            CHECK (
                TipoJornada IS NULL
                OR TipoJornada IN ('DIURNA', 'MIXTA', 'NOCTURNA')
            ),

        CONSTRAINT CK_ConceptosPlanilla_Minutos
            CHECK (Minutos IS NULL OR Minutos >= 0),

        -- Ingresos: por ejemplo 1, 1.5 o 2.
        -- Deducciones: fracción entre 0 y 1; 0.05 representa 5 %.
        CONSTRAINT CK_ConceptosPlanilla_Factor
            CHECK (
                FactorAplicado >= 0
                AND (
                    TipoConcepto <> 'DEDUCCION'
                    OR FactorAplicado <= 1
                )
            ),

        CONSTRAINT CK_ConceptosPlanilla_Monto
            CHECK (Monto >= 0)
    );

    -- 4. Índices para consultar pagos y sus conceptos.
    CREATE INDEX IX_DetallesPlanilla_Colaborador_Planilla
        ON dbo.DetallesPlanilla (ColaboradorId, PlanillaId);

    CREATE INDEX IX_DetallesPlanilla_Restaurante_Planilla
        ON dbo.DetallesPlanilla (RestauranteId, PlanillaId);

    CREATE INDEX IX_ConceptosPlanilla_Detalle
        ON dbo.ConceptosPlanilla (DetallePlanillaId);

    COMMIT TRANSACTION;

    PRINT N'Las tres tablas de planilla se crearon correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO

-- Verificación: las tablas nuevas deben quedar vacías.
SELECT N'Planillas' AS Tabla, COUNT(*) AS Registros
FROM dbo.Planillas
UNION ALL
SELECT N'DetallesPlanilla', COUNT(*)
FROM dbo.DetallesPlanilla
UNION ALL
SELECT N'ConceptosPlanilla', COUNT(*)
FROM dbo.ConceptosPlanilla;
GO

