SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    -- Evita eliminar accidentalmente una nueva estructura
    -- si ejecutás este script por segunda vez.
    IF OBJECT_ID('dbo.Solicitudes', 'U') IS NOT NULL
    BEGIN
        THROW 50001,
            'La tabla Solicitudes ya existe. No se realizaron cambios.',
            1;
    END;

    /* =====================================================
       1. ELIMINAR LAS TABLAS ANTERIORES DE SOLICITUDES

       Esto elimina también sus registros.
       No se elimina dbo.HorasExtras.
       ===================================================== */

    IF OBJECT_ID('dbo.SolicitudesHorasExtras', 'U') IS NOT NULL
    BEGIN
        DROP TABLE dbo.SolicitudesHorasExtras;
    END;

    IF OBJECT_ID('dbo.PermisosLaborales', 'U') IS NOT NULL
    BEGIN
        DROP TABLE dbo.PermisosLaborales;
    END;

    /* =====================================================
       2. CABECERA COMÚN DE SOLICITUDES
       ===================================================== */

    CREATE TABLE dbo.Solicitudes (
        SolicitudId INT IDENTITY(1,1) NOT NULL,

        TipoSolicitud VARCHAR(20) NOT NULL,

        ColaboradorId INT NOT NULL,
        RestauranteId INT NOT NULL,

        RegistradoPorUsuarioId INT NOT NULL,

        Estado VARCHAR(20) NOT NULL
            CONSTRAINT DF_Solicitudes_Estado
            DEFAULT ('PENDIENTE'),

        Motivo NVARCHAR(500) NULL,

        RevisadoPorGerenteId INT NULL,
        RevisadoPorRhId INT NULL,

        Observacion NVARCHAR(500) NULL,

        CONSTRAINT PK_Solicitudes
            PRIMARY KEY (SolicitudId),

        CONSTRAINT FK_Solicitudes_Colaboradores
            FOREIGN KEY (ColaboradorId)
            REFERENCES dbo.Colaboradores(ColaboradorId),

        CONSTRAINT FK_Solicitudes_Restaurantes
            FOREIGN KEY (RestauranteId)
            REFERENCES dbo.Restaurantes(RestauranteId),

        CONSTRAINT FK_Solicitudes_RegistradoPor
            FOREIGN KEY (RegistradoPorUsuarioId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT FK_Solicitudes_RevisadoPorGerente
            FOREIGN KEY (RevisadoPorGerenteId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT FK_Solicitudes_RevisadoPorRh
            FOREIGN KEY (RevisadoPorRhId)
            REFERENCES dbo.Usuarios(UsuarioId),

        CONSTRAINT CK_Solicitudes_Tipo
            CHECK (
                TipoSolicitud IN (
                    'HORAS_EXTRAS',
                    'PERMISO_LABORAL',
                    'INCAPACIDAD',
                    'VACACIONES'
                )
            ),

        CONSTRAINT CK_Solicitudes_Estado
            CHECK (
                Estado IN (
                    'PENDIENTE',
                    'EN_REVISION_RH',
                    'APROBADA',
                    'RECHAZADA'
                )
            ),

        -- Los permisos y las solicitudes de extras
        -- mantienen el motivo obligatorio.
        CONSTRAINT CK_Solicitudes_Motivo
            CHECK (
                TipoSolicitud NOT IN (
                    'HORAS_EXTRAS',
                    'PERMISO_LABORAL'
                )
                OR (
                    Motivo IS NOT NULL
                    AND LEN(LTRIM(RTRIM(Motivo))) > 0
                )
            ),

        -- Extras y permisos no pasan por revisión de RH.
        CONSTRAINT CK_Solicitudes_FlujoPorTipo
            CHECK (
                TipoSolicitud IN (
                    'INCAPACIDAD',
                    'VACACIONES'
                )
                OR (
                    Estado <> 'EN_REVISION_RH'
                    AND RevisadoPorRhId IS NULL
                )
            ),

        CONSTRAINT CK_Solicitudes_Revision
            CHECK (
                -- Todavía no ha sido revisada.
                (
                    Estado = 'PENDIENTE'
                    AND RevisadoPorGerenteId IS NULL
                    AND RevisadoPorRhId IS NULL
                )

                OR

                -- El gerente la envió a RH.
                (
                    Estado = 'EN_REVISION_RH'
                    AND RevisadoPorGerenteId IS NOT NULL
                    AND RevisadoPorRhId IS NULL
                )

                OR

                -- Aprobación final.
                (
                    Estado = 'APROBADA'
                    AND RevisadoPorGerenteId IS NOT NULL
                    AND (
                        (
                            TipoSolicitud IN (
                                'HORAS_EXTRAS',
                                'PERMISO_LABORAL'
                            )
                            AND RevisadoPorRhId IS NULL
                        )
                        OR
                        (
                            TipoSolicitud IN (
                                'INCAPACIDAD',
                                'VACACIONES'
                            )
                            AND RevisadoPorRhId IS NOT NULL
                        )
                    )
                )

                OR

                -- Rechazo del gerente, de RH o automático.
                -- Si RH intervino, previamente debió
                -- intervenir el gerente.
                (
                    Estado = 'RECHAZADA'
                    AND (
                        RevisadoPorRhId IS NULL
                        OR RevisadoPorGerenteId IS NOT NULL
                    )
                )
            )
    );

    /* =====================================================
       3. DETALLE DE SOLICITUDES DE HORAS EXTRAS
       ===================================================== */

    CREATE TABLE dbo.SolicitudesHorasExtras (
        SolicitudId INT NOT NULL,

        FechaSolicitada DATE NOT NULL,
        MinutosSolicitados INT NOT NULL,
        MinutosAutorizados INT NULL,

        CONSTRAINT PK_SolicitudesHorasExtras
            PRIMARY KEY (SolicitudId),

        CONSTRAINT FK_SolicitudesHorasExtras_Solicitudes
            FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Solicitudes(SolicitudId),

        CONSTRAINT CK_SolicitudesHorasExtras_MinutosSolicitados
            CHECK (MinutosSolicitados > 0),

        CONSTRAINT CK_SolicitudesHorasExtras_MinutosAutorizados
            CHECK (
                MinutosAutorizados IS NULL
                OR MinutosAutorizados BETWEEN 0 AND MinutosSolicitados
            )
    );

    /* =====================================================
       4. DETALLE DE PERMISOS LABORALES
       ===================================================== */

    CREATE TABLE dbo.PermisosLaborales (
        SolicitudId INT NOT NULL,

        FechaSolicitada DATE NOT NULL,

        CONSTRAINT PK_PermisosLaborales
            PRIMARY KEY (SolicitudId),

        CONSTRAINT FK_PermisosLaborales_Solicitudes
            FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Solicitudes(SolicitudId)
    );

    /* =====================================================
       5. ÍNDICES PARA LAS CONSULTAS HABITUALES
       ===================================================== */

    CREATE INDEX IX_Solicitudes_Colaborador_Tipo_Estado
        ON dbo.Solicitudes (
            ColaboradorId,
            TipoSolicitud,
            Estado
        );

    CREATE INDEX IX_Solicitudes_Restaurante_Tipo_Estado
        ON dbo.Solicitudes (
            RestauranteId,
            TipoSolicitud,
            Estado
        );

    CREATE INDEX IX_SolicitudesHorasExtras_FechaSolicitada
        ON dbo.SolicitudesHorasExtras (FechaSolicitada);

    CREATE INDEX IX_PermisosLaborales_FechaSolicitada
        ON dbo.PermisosLaborales (FechaSolicitada);

    COMMIT TRANSACTION;

    PRINT 'Estructura de solicitudes creada correctamente.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;