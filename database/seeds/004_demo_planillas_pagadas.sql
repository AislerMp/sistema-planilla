-- Datos ficticios. Solo INSERT en tablas permanentes; no modifica registros existentes.
-- Una planilla por periodo PAGADO sin planilla; dos colaboradores DEMO por restaurante.
USE SistemaPlanilla;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

DECLARE @Guardar BIT = 1; -- 1: guardar. 0: mostrar resultados y revertir la carga.
DECLARE @Hoy DATE = CONVERT(DATE, DATEADD(HOUR, -6, SYSUTCDATETIME()));
DECLARE @UsuarioId INT, @PuestoId INT, @Ingreso DATE, @Lock INT;
DECLARE @Nuevos INT = 0, @Asistencias INT = 0, @ConceptosInsertados INT = 0;

DECLARE @Periodos TABLE (
    PeriodoId INT PRIMARY KEY, FechaInicio DATE, FechaFin DATE, FechaPago DATE
);
DECLARE @Demo TABLE (
    RestauranteId INT, Numero INT, Identificacion NVARCHAR(30),
    Correo NVARCHAR(100), ColaboradorId INT NULL, Tarifa DECIMAL(12,2) NULL,
    PRIMARY KEY (RestauranteId, Numero)
);
DECLARE @Jornadas TABLE (
    PeriodoId INT, ColaboradorId INT, RestauranteId INT, Fecha DATE,
    TipoJornada VARCHAR(8), Minutos INT, EntradaUTC DATETIME2(0),
    PRIMARY KEY (ColaboradorId, Fecha)
);
DECLARE @Conceptos TABLE (
    PeriodoId INT, ColaboradorId INT, TipoConcepto VARCHAR(10),
    CodigoConcepto VARCHAR(50), TipoJornada VARCHAR(8) NULL,
    Minutos INT NULL, FactorAplicado DECIMAL(10,6), Monto DECIMAL(14,2)
);
DECLARE @Resumen TABLE (
    PeriodoId INT, ColaboradorId INT, Ingresos DECIMAL(14,2),
    Deducciones DECIMAL(14,2), PRIMARY KEY (PeriodoId, ColaboradorId)
);
DECLARE @Planillas TABLE (PlanillaId INT PRIMARY KEY, PeriodoId INT);
DECLARE @Detalles TABLE (
    DetallePlanillaId INT PRIMARY KEY, PlanillaId INT, ColaboradorId INT
);

IF @@TRANCOUNT <> 0
    THROW 50001, N'Ejecute el script fuera de otra transaccion.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    EXEC @Lock = sys.sp_getapplock
        @Resource = N'SistemaPlanilla.DemoPlanillasPagadas.v1',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @Lock < 0
        THROW 50002, N'Hay otra carga DEMO en curso.', 1;

    -- Los periodos existentes conservan su estado y sus fechas.
    INSERT INTO @Periodos
    SELECT p.PeriodoId, p.FechaInicio, p.FechaFin, p.FechaPago
    FROM dbo.PeriodosPlanilla p WITH (UPDLOCK, HOLDLOCK)
    WHERE p.Estado = 'PAGADO' AND p.FechaPago <= @Hoy
      AND NOT EXISTS (
          SELECT 1 FROM dbo.Planillas pl WITH (UPDLOCK, HOLDLOCK)
          WHERE pl.PeriodoId = p.PeriodoId
      );

    IF NOT EXISTS (SELECT 1 FROM @Periodos)
    BEGIN
        COMMIT TRANSACTION;
        PRINT N'No hay periodos PAGADO historicos sin planilla. No se inserto nada.';
        RETURN;
    END;

    IF EXISTS (
        SELECT 1 FROM @Periodos a JOIN @Periodos b
          ON a.PeriodoId < b.PeriodoId
         AND a.FechaInicio <= b.FechaFin AND b.FechaInicio <= a.FechaFin
    )
        THROW 50003, N'Hay periodos objetivo superpuestos. No se cargaron datos.', 1;

    SELECT TOP (1) @UsuarioId = u.UsuarioId
    FROM dbo.Usuarios u JOIN dbo.Roles r ON r.RolId = u.RolId
    WHERE u.Activo = 1 AND r.Codigo IN ('ADMINISTRADOR', 'RECURSOS_HUMANOS')
    ORDER BY u.UsuarioId;
    SELECT TOP (1) @PuestoId = PuestoId
    FROM dbo.Puestos WHERE Activo = 1 AND TarifaHora > 0 ORDER BY PuestoId;
    SELECT @Ingreso = MIN(FechaInicio) FROM @Periodos;

    IF @UsuarioId IS NULL OR @PuestoId IS NULL
        THROW 50004, N'Se necesita un usuario activo de RH/administracion y un puesto activo con tarifa.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Restaurantes)
        THROW 50005, N'No hay restaurantes.', 1;

    -- No inventar porcentajes ni usar versiones fuera de vigencia.
    IF EXISTS (
        SELECT 1 FROM @Periodos p WHERE NOT EXISTS (
            SELECT 1 FROM dbo.Deducciones d
            WHERE d.TipoDeduccion = 'LEGAL' AND d.FechaVigenciaInicio <= p.FechaPago
              AND (d.FechaVigenciaFin IS NULL OR d.FechaVigenciaFin >= p.FechaPago)
        )
    )
    BEGIN
        SELECT p.* FROM @Periodos p WHERE NOT EXISTS (
            SELECT 1 FROM dbo.Deducciones d
            WHERE d.TipoDeduccion = 'LEGAL' AND d.FechaVigenciaInicio <= p.FechaPago
              AND (d.FechaVigenciaFin IS NULL OR d.FechaVigenciaFin >= p.FechaPago)
        );
        THROW 50006, N'Faltan deducciones legales vigentes para los periodos mostrados.', 1;
    END;
    IF EXISTS (
        SELECT p.PeriodoId, d.Codigo FROM @Periodos p JOIN dbo.Deducciones d
          ON d.TipoDeduccion = 'LEGAL' AND d.FechaVigenciaInicio <= p.FechaPago
         AND (d.FechaVigenciaFin IS NULL OR d.FechaVigenciaFin >= p.FechaPago)
        GROUP BY p.PeriodoId, d.Codigo HAVING COUNT(*) > 1
    )
        THROW 50007, N'Hay versiones legales superpuestas del mismo codigo.', 1;

    INSERT INTO @Demo (RestauranteId, Numero, Identificacion, Correo)
    SELECT r.RestauranteId, n.Numero,
           CONCAT(N'DEMO-PLAN-', r.RestauranteId, N'-', n.Numero),
           CONCAT(N'demo.plan.', r.RestauranteId, N'.', n.Numero, N'@example.invalid')
    FROM dbo.Restaurantes r CROSS JOIN (VALUES (1), (2)) n(Numero);

    -- Reutilizar solamente colaboradores que conserven la marca reservada DEMO.
    IF EXISTS (
        SELECT 1 FROM @Demo d JOIN dbo.Colaboradores c
          ON c.Identificacion = d.Identificacion OR c.Correo = d.Correo
        WHERE c.Identificacion <> d.Identificacion OR c.Correo <> d.Correo
           OR c.RestauranteId <> d.RestauranteId
           OR c.Nombres <> CONCAT(N'Demo Planilla ', d.Numero)
           OR c.Apellidos <> N'Datos de prueba'
           OR c.FechaIngreso > @Ingreso OR c.FechaSalida IS NOT NULL
    )
        THROW 50008, N'Un identificador DEMO ya existe con datos distintos. No se modifico.', 1;

    INSERT INTO dbo.Colaboradores (
        Identificacion, Correo, Nombres, Apellidos, FechaIngreso,
        RestauranteId, PuestoId, Activo
    )
    SELECT d.Identificacion, d.Correo, CONCAT(N'Demo Planilla ', d.Numero),
           N'Datos de prueba', @Ingreso, d.RestauranteId, @PuestoId, r.Activo
    FROM @Demo d JOIN dbo.Restaurantes r ON r.RestauranteId = d.RestauranteId
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Colaboradores c WITH (UPDLOCK, HOLDLOCK)
        WHERE c.Identificacion = d.Identificacion
    );
    SET @Nuevos = @@ROWCOUNT;

    UPDATE d SET ColaboradorId = c.ColaboradorId, Tarifa = p.TarifaHora
    FROM @Demo d JOIN dbo.Colaboradores c ON c.Identificacion = d.Identificacion
    JOIN dbo.Puestos p ON p.PuestoId = c.PuestoId;
    IF EXISTS (SELECT 1 FROM @Demo WHERE ColaboradorId IS NULL OR Tarifa IS NULL OR Tarifa <= 0)
        THROW 50009, N'Un colaborador DEMO no tiene una tarifa valida.', 1;

    -- Inicializacion habitual del colaborador; la aplicacion acumula el saldo despues.
    INSERT INTO dbo.SaldosVacaciones (
        ColaboradorId, DiasAcumulados, DiasUtilizados, FechaAcumuladaHasta
    )
    SELECT c.ColaboradorId, 0, 0, c.FechaIngreso
    FROM @Demo d JOIN dbo.Colaboradores c ON c.ColaboradorId = d.ColaboradorId
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.SaldosVacaciones s WHERE s.ColaboradorId = c.ColaboradorId
    );

    -- Lunes a sabado: diurna de 08:00 a 16:00 o mixta de 14:00 a 21:00.
    -- Los periodos de un solo dia incluyen ese dia aunque sea domingo.
    ;WITH Fechas AS (
        SELECT PeriodoId, FechaInicio AS Fecha, FechaFin FROM @Periodos
        UNION ALL
        SELECT PeriodoId, DATEADD(DAY, 1, Fecha), FechaFin
        FROM Fechas WHERE Fecha < FechaFin
    )
    INSERT INTO @Jornadas
    SELECT f.PeriodoId, d.ColaboradorId, d.RestauranteId, f.Fecha,
           CASE d.Numero WHEN 1 THEN 'DIURNA' ELSE 'MIXTA' END,
           CASE d.Numero WHEN 1 THEN 480 ELSE 420 END,
           DATEADD(HOUR, CASE d.Numero WHEN 1 THEN 14 ELSE 20 END,
                   CONVERT(DATETIME2(0), f.Fecha))
    FROM Fechas f CROSS JOIN @Demo d JOIN @Periodos p ON p.PeriodoId = f.PeriodoId
    WHERE ((DATEDIFF(DAY, CONVERT(DATE, '19000101'), f.Fecha) % 7 + 7) % 7) <> 6
       OR p.FechaInicio = p.FechaFin
    OPTION (MAXRECURSION 0);

    IF EXISTS (
        SELECT 1 FROM @Jornadas j JOIN dbo.AsistenciasDiarias a
          ON a.ColaboradorId = j.ColaboradorId AND a.FechaAsignada = j.Fecha
    )
        THROW 50010, N'Ya hay asistencias DEMO en estas fechas. No se reemplazaron.', 1;
    -- Evitar mezclar esta carga con otras fuentes de ingresos/deducciones DEMO.
    IF EXISTS (
        SELECT 1 FROM dbo.Solicitudes s JOIN @Demo d ON d.ColaboradorId = s.ColaboradorId
        WHERE s.Estado = 'APROBADA'
    )
        THROW 50011, N'Los colaboradores DEMO ya tienen solicitudes aprobadas. Revise antes de cargar.', 1;

    INSERT INTO dbo.AsistenciasDiarias (
        ColaboradorId, RestauranteId, PeriodoId, FechaAsignada,
        MinutosCalculados, TipoJornada, FechaCreacion
    )
    SELECT ColaboradorId, RestauranteId, PeriodoId, Fecha, Minutos, TipoJornada, EntradaUTC
    FROM @Jornadas;
    SET @Asistencias = @@ROWCOUNT;
    INSERT INTO dbo.MarcasAsistencia (
        ColaboradorId, FechaAsignada, NumeroIntervalo, FechaHoraEntrada, FechaHoraSalida
    )
    SELECT ColaboradorId, Fecha, 1, EntradaUTC, DATEADD(MINUTE, Minutos, EntradaUTC)
    FROM @Jornadas;

    -- Misma equivalencia del servicio: tarifa diaria = tarifa base * 8.
    -- Diurna: tarifa base. Mixta: tarifa base * 8 / 7. Feriado: factor 2.
    INSERT INTO @Conceptos
    SELECT j.PeriodoId, j.ColaboradorId, 'INGRESO',
           CASE x.Factor WHEN 1 THEN 'ORDINARIAS' ELSE 'ORDINARIAS_FERIADO' END,
           j.TipoJornada, SUM(j.Minutos),
           x.Factor,
           CONVERT(DECIMAL(14,2), ROUND(
               SUM(CONVERT(DECIMAL(18,2), j.Minutos)) * d.Tarifa * 8
               * x.Factor
               / (60.0 * CASE j.TipoJornada WHEN 'DIURNA' THEN 8 ELSE 7 END), 2))
    FROM @Jornadas j JOIN @Demo d ON d.ColaboradorId = j.ColaboradorId
    LEFT JOIN dbo.Feriados f ON f.Fecha = j.Fecha
    CROSS APPLY (SELECT CASE WHEN f.Fecha IS NULL THEN 1 ELSE 2 END AS Factor) x
    GROUP BY j.PeriodoId, j.ColaboradorId, j.TipoJornada, d.Tarifa, x.Factor;

    INSERT INTO @Resumen
    SELECT PeriodoId, ColaboradorId, SUM(Monto), 0 FROM @Conceptos
    GROUP BY PeriodoId, ColaboradorId;
    INSERT INTO @Conceptos
    SELECT r.PeriodoId, r.ColaboradorId, 'DEDUCCION', d.Codigo, NULL, NULL,
           CONVERT(DECIMAL(10,6), d.Porcentaje / 100.0),
           CONVERT(DECIMAL(14,2), ROUND(r.Ingresos * d.Porcentaje / 100.0, 2))
    FROM @Resumen r JOIN @Periodos p ON p.PeriodoId = r.PeriodoId
    JOIN dbo.Deducciones d ON d.TipoDeduccion = 'LEGAL'
      AND d.FechaVigenciaInicio <= p.FechaPago
      AND (d.FechaVigenciaFin IS NULL OR d.FechaVigenciaFin >= p.FechaPago);
    UPDATE r SET Deducciones = c.Total
    FROM @Resumen r CROSS APPLY (
        SELECT SUM(Monto) AS Total FROM @Conceptos c
        WHERE c.PeriodoId = r.PeriodoId AND c.ColaboradorId = r.ColaboradorId
          AND c.TipoConcepto = 'DEDUCCION'
    ) c;
    IF EXISTS (SELECT 1 FROM @Resumen WHERE Deducciones > Ingresos)
        THROW 50012, N'Las deducciones superan los ingresos. Se revierte toda la carga.', 1;
    IF (SELECT COUNT_BIG(*) FROM @Resumen) <>
       (SELECT COUNT_BIG(*) FROM @Periodos) * (SELECT COUNT_BIG(*) FROM @Demo)
        THROW 50013, N'Faltan ingresos de algun colaborador/periodo.', 1;

    INSERT INTO dbo.Planillas (
        PeriodoId, FechaPago, RegistradoPorUsuarioId,
        TotalIngresos, TotalDeducciones, TotalNeto
    )
    OUTPUT INSERTED.PlanillaId, INSERTED.PeriodoId INTO @Planillas
    SELECT p.PeriodoId, p.FechaPago, @UsuarioId,
           SUM(r.Ingresos), SUM(r.Deducciones), SUM(r.Ingresos - r.Deducciones)
    FROM @Periodos p JOIN @Resumen r ON r.PeriodoId = p.PeriodoId
    GROUP BY p.PeriodoId, p.FechaPago;
    INSERT INTO dbo.DetallesPlanilla (
        PlanillaId, ColaboradorId, RestauranteId, TarifaHoraAplicada,
        TotalIngresos, TotalDeducciones, TotalNeto
    )
    OUTPUT INSERTED.DetallePlanillaId, INSERTED.PlanillaId, INSERTED.ColaboradorId INTO @Detalles
    SELECT p.PlanillaId, r.ColaboradorId, d.RestauranteId, d.Tarifa,
           r.Ingresos, r.Deducciones, r.Ingresos - r.Deducciones
    FROM @Resumen r JOIN @Planillas p ON p.PeriodoId = r.PeriodoId
    JOIN @Demo d ON d.ColaboradorId = r.ColaboradorId;
    INSERT INTO dbo.ConceptosPlanilla (
        DetallePlanillaId, TipoConcepto, CodigoConcepto, TipoJornada,
        Minutos, FactorAplicado, Monto
    )
    SELECT d.DetallePlanillaId, c.TipoConcepto, c.CodigoConcepto, c.TipoJornada,
           c.Minutos, c.FactorAplicado, c.Monto
    FROM @Conceptos c JOIN @Planillas p ON p.PeriodoId = c.PeriodoId
    JOIN @Detalles d ON d.PlanillaId = p.PlanillaId AND d.ColaboradorId = c.ColaboradorId;
    SET @ConceptosInsertados = @@ROWCOUNT;

    -- Verificar los importes realmente insertados antes de confirmar.
    IF EXISTS (
        SELECT 1 FROM @Detalles n
        JOIN dbo.DetallesPlanilla d ON d.DetallePlanillaId = n.DetallePlanillaId
        CROSS APPLY (
            SELECT SUM(CASE WHEN TipoConcepto = 'INGRESO' THEN Monto ELSE 0 END) AS I,
                   SUM(CASE WHEN TipoConcepto = 'DEDUCCION' THEN Monto ELSE 0 END) AS D
            FROM dbo.ConceptosPlanilla c WHERE c.DetallePlanillaId = d.DetallePlanillaId
        ) c
        WHERE c.I IS NULL OR c.D IS NULL OR c.I <> d.TotalIngresos OR c.D <> d.TotalDeducciones
           OR c.I - c.D <> d.TotalNeto
    )
        THROW 50014, N'Los conceptos no cuadran con sus detalles.', 1;
    IF EXISTS (
        SELECT 1 FROM @Planillas n JOIN dbo.Planillas p ON p.PlanillaId = n.PlanillaId
        CROSS APPLY (
            SELECT SUM(TotalIngresos) AS I, SUM(TotalDeducciones) AS D, SUM(TotalNeto) AS N
            FROM dbo.DetallesPlanilla d WHERE d.PlanillaId = p.PlanillaId
        ) d
        WHERE d.I IS NULL OR d.I <> p.TotalIngresos OR d.D <> p.TotalDeducciones OR d.N <> p.TotalNeto
    )
        THROW 50015, N'Los detalles no cuadran con la planilla.', 1;

    SELECT @Guardar AS Guardar, @Nuevos AS ColaboradoresNuevos,
           @Asistencias AS AsistenciasNuevas,
           (SELECT COUNT(*) FROM @Planillas) AS PlanillasNuevas,
           (SELECT COUNT(*) FROM @Detalles) AS DetallesNuevos,
           @ConceptosInsertados AS ConceptosNuevos;
    SELECT p.* FROM dbo.Planillas p JOIN @Planillas n ON n.PlanillaId = p.PlanillaId
    ORDER BY p.FechaPago;
    SELECT d.ColaboradorId, d.Identificacion, r.Nombre AS Restaurante, d.Tarifa
    FROM @Demo d JOIN dbo.Restaurantes r ON r.RestauranteId = d.RestauranteId
    ORDER BY d.RestauranteId, d.Numero;

    IF @Guardar = 1
    BEGIN
        COMMIT TRANSACTION;
        PRINT N'Datos DEMO guardados. Los registros existentes se conservaron.';
    END
    ELSE
    BEGIN
        ROLLBACK TRANSACTION;
        PRINT N'Vista previa: carga revertida. Los IDENTITY pueden dejar saltos.';
    END;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
