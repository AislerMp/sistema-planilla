-- Ejecutar en SSMS sobre la base de datos del proyecto.
-- Porcentajes definidos para el proyecto: INS 0 %, maternidad CCSS 50 %.
-- Conserva los tipos existentes e inserta solamente los códigos faltantes.
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.TiposIncapacidad
        WHERE Codigo = 'RIESGO_TRABAJO_INS'
    )
    BEGIN
        INSERT INTO dbo.TiposIncapacidad (
            Codigo, Nombre, EntidadEmisora, PorcentajePatronal, Activo
        )
        VALUES (
            'RIESGO_TRABAJO_INS', N'Riesgo del trabajo', N'INS', 0.00, 1
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.TiposIncapacidad
        WHERE Codigo = 'MATERNIDAD_CCSS'
    )
    BEGIN
        INSERT INTO dbo.TiposIncapacidad (
            Codigo, Nombre, EntidadEmisora, PorcentajePatronal, Activo
        )
        VALUES (
            'MATERNIDAD_CCSS', N'Maternidad', N'CCSS', 50.00, 1
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT TipoIncapacidadId, Codigo, Nombre, EntidadEmisora,
       PorcentajePatronal, Activo
FROM dbo.TiposIncapacidad
WHERE Codigo IN ('ENFERMEDAD_CCSS', 'RIESGO_TRABAJO_INS', 'MATERNIDAD_CCSS')
ORDER BY TipoIncapacidadId;
