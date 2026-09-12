USE SistemaPlanilla;
GO

CREATE TABLE dbo.Bitacora (
    BitacoraId BIGINT IDENTITY(1,1) NOT NULL,
    FechaEvento DATETIME2(3) NOT NULL
        CONSTRAINT DF_Bitacora_FechaEvento DEFAULT SYSUTCDATETIME(),

    UsuarioId INT NOT NULL,
    Entidad NVARCHAR(50) NOT NULL,
    RegistroId INT NOT NULL,
    Accion NVARCHAR(30) NOT NULL,

    DatosAnteriores NVARCHAR(MAX) NULL,
    DatosNuevos NVARCHAR(MAX) NOT NULL,

    CONSTRAINT PK_Bitacora
        PRIMARY KEY (BitacoraId),

    CONSTRAINT FK_Bitacora_Usuarios
        FOREIGN KEY (UsuarioId)
        REFERENCES dbo.Usuarios(UsuarioId),

    CONSTRAINT CK_Bitacora_DatosAnteriores
        CHECK (
            DatosAnteriores IS NULL
            OR ISJSON(DatosAnteriores) = 1
        ),

    CONSTRAINT CK_Bitacora_DatosNuevos
        CHECK (ISJSON(DatosNuevos) = 1)
);
GO