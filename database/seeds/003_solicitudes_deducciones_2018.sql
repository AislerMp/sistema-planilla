-- Datos de ejemplo para el colaborador 2018: 2 aprobadas y 4 rechazadas.
-- Ejecutar en SSMS. No modifica tablas ni solicitudes existentes.
USE SistemaPlanilla;
GO

SET XACT_ABORT ON;

DECLARE @ColaboradorId INT = 2018;
DECLARE @Hoy DATE = CONVERT(DATE, DATEADD(HOUR, -6, SYSUTCDATETIME())); -- Costa Rica
DECLARE @PrimerMes DATE = DATEFROMPARTS(
    YEAR(DATEADD(MONTH, 1, @Hoy)),
    MONTH(DATEADD(MONTH, 1, @Hoy)),
    1
);
DECLARE @UltimoDia DATE = DATEADD(DAY, 9, DATEADD(MONTH, 5, @PrimerMes));

DECLARE @RestauranteId INT;
DECLARE @UsuarioColaboradorId INT;
DECLARE @UsuarioRhId INT;
DECLARE @DeduccionId INT;
DECLARE @Numero INT = 1;
DECLARE @SolicitudId INT;
DECLARE @Estado VARCHAR(20);
DECLARE @Porcentaje DECIMAL(5,2);
DECLARE @FechaInicio DATE;
DECLARE @FechaFin DATE;
DECLARE @Motivo NVARCHAR(500);
DECLARE @Observacion NVARCHAR(500);

DECLARE @Registros TABLE (
    Numero INT PRIMARY KEY,
    Estado VARCHAR(20) NOT NULL,
    Porcentaje DECIMAL(5,2) NOT NULL,
    FechaInicio DATE NOT NULL,
    FechaFin DATE NOT NULL,
    Motivo NVARCHAR(500) NOT NULL,
    Observacion NVARCHAR(500) NOT NULL
);

DECLARE @Nuevas TABLE (SolicitudId INT PRIMARY KEY);

INSERT INTO @Registros (Numero, Estado, Porcentaje, FechaInicio, FechaFin, Motivo, Observacion)
SELECT
    v.Numero,
    v.Estado,
    v.Porcentaje,
    DATEADD(MONTH, v.Mes, @PrimerMes),
    DATEADD(DAY, 9, DATEADD(MONTH, v.Mes, @PrimerMes)),
    CONCAT(N'[demo deducciones 2018 #', v.Numero, N'] ', v.Motivo),
    v.Observacion
FROM (VALUES
    (1, 'APROBADA',  5.00, 0, N'Ahorro para fin de año.',                 N'Solicitud aprobada para el período indicado.'),
    (2, 'RECHAZADA', 8.00, 1, N'Ahorro personal temporal.',               N'Se requiere revisar el porcentaje solicitado.'),
    (3, 'RECHAZADA', 4.00, 2, N'Reserva para gastos personales.',         N'No procede para este período.'),
    (4, 'APROBADA',  3.50, 3, N'Ahorro voluntario por diez días.',        N'Solicitud aprobada para el período indicado.'),
    (5, 'RECHAZADA', 6.00, 4, N'Ahorro para una compra planificada.',     N'Se solicita presentar una nueva solicitud con otros datos.'),
    (6, 'RECHAZADA', 2.00, 5, N'Ahorro adicional de corto plazo.',        N'No se aprueba la deducción solicitada.')
) AS v(Numero, Estado, Porcentaje, Mes, Motivo, Observacion);

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.SolicitudesDeducciones', 'U') IS NULL
        THROW 50001, N'Falta aplicar la migración 008 de deducciones.', 1;

    SELECT @RestauranteId = c.RestauranteId
    FROM dbo.Colaboradores AS c
    WHERE c.ColaboradorId = @ColaboradorId AND c.Activo = 1;

    IF @RestauranteId IS NULL
        THROW 50002, N'El colaborador 2018 no existe o está inactivo.', 1;

    SELECT @UsuarioColaboradorId = u.UsuarioId
    FROM dbo.Usuarios AS u
    INNER JOIN dbo.Roles AS r ON r.RolId = u.RolId
    WHERE u.ColaboradorId = @ColaboradorId
      AND u.Activo = 1
      AND r.Codigo = 'COLABORADOR';

    IF @UsuarioColaboradorId IS NULL
        THROW 50003, N'El colaborador 2018 necesita un usuario activo con rol COLABORADOR.', 1;

    SELECT TOP (1) @UsuarioRhId = u.UsuarioId
    FROM dbo.Usuarios AS u
    INNER JOIN dbo.Roles AS r ON r.RolId = u.RolId
    WHERE u.Activo = 1 AND r.Codigo = 'RECURSOS_HUMANOS'
    ORDER BY u.UsuarioId;

    IF @UsuarioRhId IS NULL
        THROW 50004, N'Se necesita un usuario activo de Recursos Humanos.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.Solicitudes AS s
        WHERE s.ColaboradorId = @ColaboradorId
          AND s.TipoSolicitud = 'DEDUCCION'
          AND CHARINDEX(N'[demo deducciones 2018 #', s.Motivo) = 1
    )
        THROW 50005, N'Estos registros de ejemplo ya se insertaron. No se duplicaron.', 1;

    -- Se elige un concepto adicional vigente durante los seis meses.
    -- Una solicitud pendiente o aprobada del mismo concepto impide superponer fechas.
    SELECT TOP (1) @DeduccionId = d.DeduccionId
    FROM dbo.Deducciones AS d
    WHERE d.TipoDeduccion = 'ADICIONAL'
      AND d.FechaVigenciaInicio <= @PrimerMes
      AND (d.FechaVigenciaFin IS NULL OR d.FechaVigenciaFin >= @UltimoDia)
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.SolicitudesDeducciones AS sd
          INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = sd.SolicitudId
          INNER JOIN dbo.Deducciones AS anterior ON anterior.DeduccionId = sd.DeduccionId
          WHERE s.ColaboradorId = @ColaboradorId
            AND s.TipoSolicitud = 'DEDUCCION'
            AND s.Estado IN ('PENDIENTE', 'APROBADA')
            AND anterior.Codigo = d.Codigo
            AND sd.FechaInicio <= @UltimoDia
            AND (sd.FechaFin IS NULL OR sd.FechaFin >= @PrimerMes)
      )
    ORDER BY CASE WHEN d.Codigo = 'AHORRO_NAVIDENO' THEN 0 ELSE 1 END,
             d.FechaVigenciaInicio DESC, d.DeduccionId DESC;

    IF @DeduccionId IS NULL
        THROW 50006, N'No hay una deducción ADICIONAL vigente y libre de superposiciones para estas fechas.', 1;

    WHILE @Numero <= 6
    BEGIN
        SELECT
            @Estado = Estado,
            @Porcentaje = Porcentaje,
            @FechaInicio = FechaInicio,
            @FechaFin = FechaFin,
            @Motivo = Motivo,
            @Observacion = Observacion
        FROM @Registros
        WHERE Numero = @Numero;

        INSERT INTO dbo.Solicitudes (
            TipoSolicitud, ColaboradorId, RestauranteId, RegistradoPorUsuarioId,
            Estado, Motivo, RevisadoPorGerenteId, RevisadoPorRhId, Observacion
        )
        VALUES (
            'DEDUCCION', @ColaboradorId, @RestauranteId, @UsuarioColaboradorId,
            @Estado, @Motivo, NULL, @UsuarioRhId, @Observacion
        );

        SET @SolicitudId = CONVERT(INT, SCOPE_IDENTITY());

        INSERT INTO dbo.SolicitudesDeducciones (
            SolicitudId, DeduccionId, PorcentajeSolicitado,
            FechaInicio, FechaFin, Autorizacion
        )
        VALUES (
            @SolicitudId, @DeduccionId, @Porcentaje,
            @FechaInicio, @FechaFin, 1
        );

        INSERT INTO @Nuevas (SolicitudId) VALUES (@SolicitudId);
        SET @Numero += 1;
    END;

    COMMIT TRANSACTION;

    SELECT
        s.SolicitudId, s.ColaboradorId, s.Estado,
        d.Nombre AS Deduccion, sd.PorcentajeSolicitado,
        sd.FechaInicio, sd.FechaFin,
        s.RegistradoPorUsuarioId, s.RevisadoPorRhId
    FROM @Nuevas AS n
    INNER JOIN dbo.Solicitudes AS s ON s.SolicitudId = n.SolicitudId
    INNER JOIN dbo.SolicitudesDeducciones AS sd ON sd.SolicitudId = s.SolicitudId
    INNER JOIN dbo.Deducciones AS d ON d.DeduccionId = sd.DeduccionId
    ORDER BY sd.FechaInicio;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
