USE SistemaPlanilla;
GO

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Solicitudes', 'U') IS NULL
        THROW 50001, N'No existe la tabla Solicitudes.', 1;

    IF OBJECT_ID('dbo.Deducciones', 'U') IS NOT NULL
       OR OBJECT_ID('dbo.SolicitudesDeducciones', 'U') IS NOT NULL
        THROW 50002, N'Una de las tablas de deducciones ya existe. No se realizaron cambios.', 1;

    -- 1. Catálogo y versiones de las deducciones.
    CREATE TABLE dbo.Deducciones (
        DeduccionId INT IDENTITY(1,1) NOT NULL,
        Nombre NVARCHAR(100) NOT NULL,
        Codigo VARCHAR(50) NOT NULL,
        TipoDeduccion VARCHAR(15) NOT NULL,
        Porcentaje DECIMAL(5,2) NULL,
        FechaVigenciaInicio DATE NOT NULL,
        FechaVigenciaFin DATE NULL,
        EntidadReceptora NVARCHAR(100) NULL,

        CONSTRAINT PK_Deducciones
            PRIMARY KEY (DeduccionId),

        -- El mismo concepto puede tener varias versiones.
        CONSTRAINT UQ_Deducciones_Codigo_Vigencia
            UNIQUE (Codigo, FechaVigenciaInicio),

        CONSTRAINT CK_Deducciones_Tipo
            CHECK (TipoDeduccion IN ('LEGAL', 'ADICIONAL')),

        CONSTRAINT CK_Deducciones_Porcentaje
            CHECK (
                (
                    TipoDeduccion = 'LEGAL'
                    AND Porcentaje IS NOT NULL
                    AND Porcentaje > 0
                    AND Porcentaje <= 100
                )
                OR
                (
                    TipoDeduccion = 'ADICIONAL'
                    AND Porcentaje IS NULL
                )
            ),

        CONSTRAINT CK_Deducciones_Vigencia
            CHECK (
                FechaVigenciaFin IS NULL
                OR FechaVigenciaFin >= FechaVigenciaInicio
            )
    );

    -- 2. Detalle de la solicitud.
    -- Colaborador, estado y revisión permanecen en Solicitudes.
    CREATE TABLE dbo.SolicitudesDeducciones (
        SolicitudId INT NOT NULL,
        DeduccionId INT NOT NULL,
        PorcentajeSolicitado DECIMAL(5,2) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NULL,
        Autorizacion BIT NOT NULL,

        CONSTRAINT PK_SolicitudesDeducciones
            PRIMARY KEY (SolicitudId),

        CONSTRAINT FK_SolicitudesDeducciones_Solicitudes
            FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Solicitudes(SolicitudId),

        CONSTRAINT FK_SolicitudesDeducciones_Deducciones
            FOREIGN KEY (DeduccionId)
            REFERENCES dbo.Deducciones(DeduccionId),

        CONSTRAINT CK_SolicitudesDeducciones_Porcentaje
            CHECK (
                PorcentajeSolicitado > 0
                AND PorcentajeSolicitado <= 100
            ),

        CONSTRAINT CK_SolicitudesDeducciones_Fechas
            CHECK (
                FechaFin IS NULL
                OR FechaFin >= FechaInicio
            ),

        CONSTRAINT CK_SolicitudesDeducciones_Autorizacion
            CHECK (Autorizacion = 1)
    );

    -- 3. Permitir el nuevo tipo de solicitud.
    ALTER TABLE dbo.Solicitudes
        DROP CONSTRAINT CK_Solicitudes_Tipo;

    ALTER TABLE dbo.Solicitudes WITH CHECK
        ADD CONSTRAINT CK_Solicitudes_Tipo CHECK (
            TipoSolicitud IN (
                'HORAS_EXTRAS',
                'PERMISO_LABORAL',
                'INCAPACIDAD',
                'VACACIONES',
                'DEDUCCION'
            )
        );

    -- 4. Incorporar el flujo directo de RH para deducciones.
    ALTER TABLE dbo.Solicitudes
        DROP CONSTRAINT CK_Solicitudes_FlujoPorTipo;

    ALTER TABLE dbo.Solicitudes WITH CHECK
        ADD CONSTRAINT CK_Solicitudes_FlujoPorTipo CHECK (
            TipoSolicitud IN ('INCAPACIDAD', 'VACACIONES')
            OR (
                TipoSolicitud IN ('HORAS_EXTRAS', 'PERMISO_LABORAL')
                AND Estado <> 'EN_REVISION_RH'
                AND RevisadoPorRhId IS NULL
            )
            OR (
                TipoSolicitud = 'DEDUCCION'
                AND Estado <> 'EN_REVISION_RH'
                AND RevisadoPorGerenteId IS NULL
            )
        );

    ALTER TABLE dbo.Solicitudes
        DROP CONSTRAINT CK_Solicitudes_Revision;

    ALTER TABLE dbo.Solicitudes WITH CHECK
        ADD CONSTRAINT CK_Solicitudes_Revision CHECK (
            -- Pendiente: todavía nadie la ha revisado.
            (
                Estado = 'PENDIENTE'
                AND RevisadoPorGerenteId IS NULL
                AND RevisadoPorRhId IS NULL
            )
            OR (
                Estado = 'EN_REVISION_RH'
                AND TipoSolicitud IN ('INCAPACIDAD', 'VACACIONES')
                AND RevisadoPorGerenteId IS NOT NULL
                AND RevisadoPorRhId IS NULL
            )
            OR (
                Estado = 'APROBADA'
                AND (
                    -- Extras y permisos: aprueba el gerente.
                    (
                        TipoSolicitud IN (
                            'HORAS_EXTRAS',
                            'PERMISO_LABORAL'
                        )
                        AND RevisadoPorGerenteId IS NOT NULL
                        AND RevisadoPorRhId IS NULL
                    )
                    OR (
                        -- Incapacidades y vacaciones: gerente y RH.
                        TipoSolicitud IN (
                            'INCAPACIDAD',
                            'VACACIONES'
                        )
                        AND RevisadoPorGerenteId IS NOT NULL
                        AND RevisadoPorRhId IS NOT NULL
                    )
                    OR (
                        -- Deducciones: aprueba RH directamente.
                        TipoSolicitud = 'DEDUCCION'
                        AND RevisadoPorGerenteId IS NULL
                        AND RevisadoPorRhId IS NOT NULL
                    )
                )
            )
            OR (
                Estado = 'RECHAZADA'
                AND (
                    (
                        TipoSolicitud <> 'DEDUCCION'
                        AND (
                            RevisadoPorRhId IS NULL
                            OR RevisadoPorGerenteId IS NOT NULL
                        )
                    )
                    OR (
                        -- Deducciones: rechaza RH directamente.
                        TipoSolicitud = 'DEDUCCION'
                        AND RevisadoPorGerenteId IS NULL
                        AND RevisadoPorRhId IS NOT NULL
                    )
                )
            )
        );

    -- 5. Deducciones legales: configuración inicial de 2026.
    INSERT INTO dbo.Deducciones (
        Nombre,
        Codigo,
        TipoDeduccion,
        Porcentaje,
        FechaVigenciaInicio,
        FechaVigenciaFin,
        EntidadReceptora
    )
    VALUES
        (
            N'Seguro de Enfermedad y Maternidad',
            'CCSS_SEM',
            'LEGAL',
            5.50,
            '20260101',
            NULL,
            N'CCSS'
        ),
        (
            N'Invalidez, Vejez y Muerte',
            'CCSS_IVM',
            'LEGAL',
            4.33,
            '20260101',
            NULL,
            N'CCSS'
        ),
        (
            N'Banco Popular',
            'BANCO_POPULAR',
            'LEGAL',
            1.00,
            '20260101',
            NULL,
            N'Banco Popular'
        );

    -- Adicional de ejemplo.
    -- Su porcentaje se guardará en la solicitud del colaborador.
    INSERT INTO dbo.Deducciones (
        Nombre,
        Codigo,
        TipoDeduccion,
        Porcentaje,
        FechaVigenciaInicio,
        FechaVigenciaFin,
        EntidadReceptora
    )
    VALUES (
        N'Ahorro navideño',
        'AHORRO_NAVIDENO',
        'ADICIONAL',
        NULL,
        '20260101',
        NULL,
        N'Empresa'
    );

    COMMIT TRANSACTION;

    PRINT N'Tablas y configuración de deducciones creadas correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO

SELECT
    DeduccionId,
    Nombre,
    Codigo,
    TipoDeduccion,
    Porcentaje,
    FechaVigenciaInicio,
    FechaVigenciaFin,
    EntidadReceptora
FROM dbo.Deducciones
ORDER BY DeduccionId;