SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* 1. Catálogo de tipos de incapacidad */
    CREATE TABLE dbo.TiposIncapacidad (
        TipoIncapacidadId INT IDENTITY(1,1) NOT NULL,
        Codigo VARCHAR(30) NOT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        EntidadEmisora NVARCHAR(50) NOT NULL,
        PorcentajePatronal DECIMAL(5,2) NOT NULL,

        Activo BIT NOT NULL
            CONSTRAINT DF_TiposIncapacidad_Activo DEFAULT (1),

        CONSTRAINT PK_TiposIncapacidad
            PRIMARY KEY (TipoIncapacidadId),

        CONSTRAINT UQ_TiposIncapacidad_Codigo
            UNIQUE (Codigo),

        CONSTRAINT CK_TiposIncapacidad_PorcentajePatronal
            CHECK (PorcentajePatronal BETWEEN 0 AND 100)
    );

    /* 2. Detalle de la solicitud de incapacidad */
    CREATE TABLE dbo.Incapacidades (
        SolicitudId INT NOT NULL,
        TipoIncapacidadId INT NOT NULL,

        NumeroDocumento NVARCHAR(50) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NOT NULL,

        ComprobanteRuta NVARCHAR(500) NOT NULL,
        ComprobanteNombre NVARCHAR(255) NOT NULL,

        CONSTRAINT PK_Incapacidades
            PRIMARY KEY (SolicitudId),

        CONSTRAINT FK_Incapacidades_Solicitudes
            FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Solicitudes(SolicitudId),

        CONSTRAINT FK_Incapacidades_TiposIncapacidad
            FOREIGN KEY (TipoIncapacidadId)
            REFERENCES dbo.TiposIncapacidad(TipoIncapacidadId),

        CONSTRAINT CK_Incapacidades_Fechas
            CHECK (FechaFin >= FechaInicio)
    );

    /* 3. Tiempo reconocido para el pago de la incapacidad */
    CREATE TABLE dbo.CalculosIncapacidad (
        CalculoId INT IDENTITY(1,1) NOT NULL,
        SolicitudId INT NOT NULL,
        PeriodoId INT NOT NULL,

        MinutosReconocidos INT NOT NULL,
        PorcentajePatronalAplicado DECIMAL(5,2) NOT NULL,

        CONSTRAINT PK_CalculosIncapacidad
            PRIMARY KEY (CalculoId),

        CONSTRAINT UQ_CalculosIncapacidad_Solicitud
            UNIQUE (SolicitudId),

        CONSTRAINT FK_CalculosIncapacidad_Incapacidades
            FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Incapacidades(SolicitudId),

        CONSTRAINT FK_CalculosIncapacidad_PeriodosPlanilla
            FOREIGN KEY (PeriodoId)
            REFERENCES dbo.PeriodosPlanilla(PeriodoId),

        CONSTRAINT CK_CalculosIncapacidad_MinutosReconocidos
            CHECK (MinutosReconocidos >= 0),

        CONSTRAINT CK_CalculosIncapacidad_PorcentajePatronal
            CHECK (PorcentajePatronalAplicado BETWEEN 0 AND 100)
    );

    /* Tipo inicial que utilizaremos en este módulo */
    INSERT INTO dbo.TiposIncapacidad (
        Codigo,
        Nombre,
        EntidadEmisora,
        PorcentajePatronal
    )
    VALUES (
        'ENFERMEDAD_CCSS',
        N'Enfermedad común',
        N'CCSS',
        50.00
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;