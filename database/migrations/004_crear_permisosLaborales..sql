CREATE TABLE dbo.PermisosLaborales (
    PermisoId INT IDENTITY(1,1) NOT NULL,
    ColaboradorId INT NOT NULL,
    RestauranteId INT NOT NULL,

    FechaSolicitada DATE NOT NULL,
    Motivo NVARCHAR(500) NOT NULL,

    Estado VARCHAR(15) NOT NULL
        CONSTRAINT DF_PermisosLaborales_Estado
        DEFAULT ('PENDIENTE'),

    RevisadoPorUsuarioId INT NULL,
    Observacion NVARCHAR(500) NULL,

    CONSTRAINT PK_PermisosLaborales
        PRIMARY KEY (PermisoId),

    CONSTRAINT FK_PermisosLaborales_Colaboradores
        FOREIGN KEY (ColaboradorId)
        REFERENCES dbo.Colaboradores(ColaboradorId),

    CONSTRAINT FK_PermisosLaborales_Restaurantes
        FOREIGN KEY (RestauranteId)
        REFERENCES dbo.Restaurantes(RestauranteId),

    CONSTRAINT FK_PermisosLaborales_Usuarios
        FOREIGN KEY (RevisadoPorUsuarioId)
        REFERENCES dbo.Usuarios(UsuarioId),

    -- Un permiso por colaborador y fecha,
    -- independientemente de su estado.
    CONSTRAINT UQ_PermisosLaborales_Colaborador_Fecha
        UNIQUE (ColaboradorId, FechaSolicitada),

    CONSTRAINT CK_PermisosLaborales_Motivo
        CHECK (LEN(LTRIM(RTRIM(Motivo))) > 0),

    CONSTRAINT CK_PermisosLaborales_Estado
        CHECK (
            Estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')
        ),

    -- Una solicitud resuelta debe identificar a quien la revisó.
    CONSTRAINT CK_PermisosLaborales_Revision CHECK (
        (Estado = 'PENDIENTE' AND RevisadoPorUsuarioId IS NULL)
        OR (Estado IN ('APROBADA', 'RECHAZADA') AND RevisadoPorUsuarioId IS NOT NULL)
        OR (
            Estado = 'RECHAZADA'
            AND RevisadoPorUsuarioId IS NULL
            AND Observacion IS NOT NULL
            AND Observacion = N'Rechazada automáticamente por vencimiento'
        )
    )
);