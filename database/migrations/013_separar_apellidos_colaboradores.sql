USE SistemaPlanilla;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Ejecutar manualmente en SSMS. El apellido anterior se conserva completo.
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.Colaboradores', N'U') IS NULL
        THROW 50001, N'No existe dbo.Colaboradores.', 1;

    IF COL_LENGTH(N'dbo.Colaboradores', N'Apellidos') IS NOT NULL
    BEGIN
        IF COL_LENGTH(N'dbo.Colaboradores', N'Apellido1') IS NOT NULL
            THROW 50002, N'Existen Apellidos y Apellido1. Revisar el esquema antes de migrar.', 1;

        EXEC sys.sp_rename N'dbo.Colaboradores.Apellidos', N'Apellido1', N'COLUMN';
    END;

    IF COL_LENGTH(N'dbo.Colaboradores', N'Apellido1') IS NULL
        THROW 50003, N'No se encontró la columna de primer apellido.', 1;

    IF COL_LENGTH(N'dbo.Colaboradores', N'Apellido2') IS NULL
        EXEC(N'ALTER TABLE dbo.Colaboradores ADD Apellido2 NVARCHAR(100) NULL;');

    IF OBJECT_ID(N'dbo.CK_Colaboradores_Apellidos', N'C') IS NOT NULL
        ALTER TABLE dbo.Colaboradores DROP CONSTRAINT CK_Colaboradores_Apellidos;

    IF OBJECT_ID(N'dbo.CK_Colaboradores_Apellido1', N'C') IS NULL
        EXEC(N'ALTER TABLE dbo.Colaboradores WITH CHECK ADD CONSTRAINT CK_Colaboradores_Apellido1 CHECK (LEN(LTRIM(RTRIM(Apellido1))) > 0);');

    IF OBJECT_ID(N'dbo.CK_Colaboradores_Apellido2', N'C') IS NULL
        EXEC(N'ALTER TABLE dbo.Colaboradores WITH CHECK ADD CONSTRAINT CK_Colaboradores_Apellido2 CHECK (Apellido2 IS NULL OR LEN(LTRIM(RTRIM(Apellido2))) > 0);');

    COMMIT TRANSACTION;
    PRINT N'Apellidos migrados a Apellido1. Apellido2 queda NULL para los registros migrados.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
