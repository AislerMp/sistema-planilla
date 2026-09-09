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
IF EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo')
    AND name IN (N'Provincias',N'Cantones',N'Distritos',N'Restaurantes',N'Puestos',
                 N'Roles',N'Colaboradores',N'Usuarios'))
    THROW 50001, N'Ya existen tablas base. Este script es para una instalación nueva; no borra ni modifica tablas existentes.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
-- Los IDs territoriales son los códigos oficiales; no llevan IDENTITY.
CREATE TABLE dbo.Provincias (
    ProvinciaId INT NOT NULL CONSTRAINT PK_Provincias PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Provincias_Nombre UNIQUE (Nombre)
);
CREATE TABLE dbo.Cantones (
    CantonId INT NOT NULL CONSTRAINT PK_Cantones PRIMARY KEY,
    ProvinciaId INT NOT NULL,
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT FK_Cantones_Provincias FOREIGN KEY (ProvinciaId)
        REFERENCES dbo.Provincias(ProvinciaId),
    CONSTRAINT CK_Cantones_Codigo CHECK (CantonId / 100 = ProvinciaId),
    CONSTRAINT UQ_Cantones_Provincia_Nombre UNIQUE (ProvinciaId, Nombre)
);
CREATE TABLE dbo.Distritos (
    DistritoId INT NOT NULL CONSTRAINT PK_Distritos PRIMARY KEY,
    CantonId INT NOT NULL,
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT FK_Distritos_Cantones FOREIGN KEY (CantonId)
        REFERENCES dbo.Cantones(CantonId),
    CONSTRAINT CK_Distritos_Codigo CHECK (DistritoId / 100 = CantonId),
    CONSTRAINT UQ_Distritos_Canton_Nombre UNIQUE (CantonId, Nombre)
);
CREATE TABLE dbo.Restaurantes (
    RestauranteId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Restaurantes PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL CONSTRAINT UQ_Restaurantes_Nombre UNIQUE,
    DistritoId INT NULL,
    DetalleDireccion NVARCHAR(300) NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Restaurantes_Activo DEFAULT (1),
    CONSTRAINT FK_Restaurantes_Distritos FOREIGN KEY (DistritoId)
        REFERENCES dbo.Distritos(DistritoId),
    CONSTRAINT CK_Restaurantes_Nombre CHECK (LEN(LTRIM(RTRIM(Nombre))) > 0),
    CONSTRAINT CK_Restaurantes_Direccion CHECK (
        (DistritoId IS NULL AND DetalleDireccion IS NULL) OR
        (DistritoId IS NOT NULL AND DetalleDireccion IS NOT NULL
            AND LEN(LTRIM(RTRIM(DetalleDireccion))) > 0)
    )
);
CREATE TABLE dbo.Puestos (
    PuestoId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Puestos PRIMARY KEY,
    Nombre NVARCHAR(80) NOT NULL CONSTRAINT UQ_Puestos_Nombre UNIQUE,
    TarifaHora DECIMAL(12,2) NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Puestos_Activo DEFAULT (1),
    CONSTRAINT CK_Puestos_Nombre CHECK (LEN(LTRIM(RTRIM(Nombre))) > 0),
    CONSTRAINT CK_Puestos_TarifaHora CHECK (TarifaHora IS NULL OR TarifaHora > 0)
);
CREATE TABLE dbo.Roles (
    RolId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    Codigo VARCHAR(30) NOT NULL CONSTRAINT UQ_Roles_Codigo UNIQUE,
    Nombre NVARCHAR(60) NOT NULL CONSTRAINT UQ_Roles_Nombre UNIQUE,
    CONSTRAINT CK_Roles_Codigo CHECK (LEN(LTRIM(RTRIM(Codigo))) > 0),
    CONSTRAINT CK_Roles_Nombre CHECK (LEN(LTRIM(RTRIM(Nombre))) > 0)
);
CREATE TABLE dbo.Colaboradores (
    ColaboradorId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Colaboradores PRIMARY KEY,
    Identificacion NVARCHAR(30) NOT NULL CONSTRAINT UQ_Colaboradores_Identificacion UNIQUE,
    Nombres NVARCHAR(100) NOT NULL,
    Apellidos NVARCHAR(100) NOT NULL,
    FechaIngreso DATE NOT NULL,
    FechaSalida DATE NULL,
    RestauranteId INT NOT NULL,
    PuestoId INT NOT NULL,
    DistritoId INT NULL,
    DetalleDireccion NVARCHAR(300) NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Colaboradores_Activo DEFAULT (1),
    FechaCreacion DATETIME2(0) NOT NULL
        CONSTRAINT DF_Colaboradores_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_Colaboradores_Restaurantes FOREIGN KEY (RestauranteId)
        REFERENCES dbo.Restaurantes(RestauranteId),
    CONSTRAINT FK_Colaboradores_Puestos FOREIGN KEY (PuestoId)
        REFERENCES dbo.Puestos(PuestoId),
    CONSTRAINT FK_Colaboradores_Distritos FOREIGN KEY (DistritoId)
        REFERENCES dbo.Distritos(DistritoId),
    CONSTRAINT CK_Colaboradores_Identificacion CHECK (LEN(LTRIM(RTRIM(Identificacion))) > 0),
    CONSTRAINT CK_Colaboradores_Nombres CHECK (LEN(LTRIM(RTRIM(Nombres))) > 0),
    CONSTRAINT CK_Colaboradores_Apellidos CHECK (LEN(LTRIM(RTRIM(Apellidos))) > 0),
    CONSTRAINT CK_Colaboradores_Fechas CHECK (FechaSalida IS NULL OR FechaSalida >= FechaIngreso),
    CONSTRAINT CK_Colaboradores_Direccion CHECK (
        (DistritoId IS NULL AND DetalleDireccion IS NULL) OR
        (DistritoId IS NOT NULL AND DetalleDireccion IS NOT NULL
            AND LEN(LTRIM(RTRIM(DetalleDireccion))) > 0)
    )
);
CREATE TABLE dbo.Usuarios (
    UsuarioId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Usuarios PRIMARY KEY,
    NombreUsuario NVARCHAR(60) NOT NULL CONSTRAINT UQ_Usuarios_NombreUsuario UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    RolId INT NOT NULL,
    ColaboradorId INT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_Usuarios_Activo DEFAULT (1),
    FechaCreacion DATETIME2(0) NOT NULL
        CONSTRAINT DF_Usuarios_FechaCreacion DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_Usuarios_Roles FOREIGN KEY (RolId) REFERENCES dbo.Roles(RolId),
    CONSTRAINT FK_Usuarios_Colaboradores FOREIGN KEY (ColaboradorId)
        REFERENCES dbo.Colaboradores(ColaboradorId),
    CONSTRAINT CK_Usuarios_NombreUsuario CHECK (LEN(LTRIM(RTRIM(NombreUsuario))) > 0),
    CONSTRAINT CK_Usuarios_PasswordHash CHECK (LEN(LTRIM(RTRIM(PasswordHash))) > 0)
);
CREATE UNIQUE INDEX UX_Usuarios_ColaboradorId ON dbo.Usuarios(ColaboradorId)
    WHERE ColaboradorId IS NOT NULL;
CREATE INDEX IX_Colaboradores_RestauranteId ON dbo.Colaboradores(RestauranteId);
CREATE INDEX IX_Colaboradores_PuestoId ON dbo.Colaboradores(PuestoId);
CREATE INDEX IX_Usuarios_RolId ON dbo.Usuarios(RolId);
CREATE INDEX IX_Restaurantes_DistritoId ON dbo.Restaurantes(DistritoId);
CREATE INDEX IX_Colaboradores_DistritoId ON dbo.Colaboradores(DistritoId);

    COMMIT TRANSACTION;
    PRINT N'Las ocho tablas base se crearon correctamente, sin datos iniciales.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
