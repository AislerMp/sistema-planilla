/* 1. DETALLE DE LA SOLICITUD DE VACACIONES */

CREATE TABLE dbo.Vacaciones (
    SolicitudId INT NOT NULL,
    FechaInicio DATE NOT NULL,
    FechaFin DATE NOT NULL,
    DiasSolicitados INT NOT NULL,

    CONSTRAINT PK_Vacaciones
        PRIMARY KEY (SolicitudId),

    CONSTRAINT FK_Vacaciones_Solicitudes
        FOREIGN KEY (SolicitudId)
        REFERENCES dbo.Solicitudes(SolicitudId),

    CONSTRAINT CK_Vacaciones_Fechas
        CHECK (FechaFin >= FechaInicio),

    CONSTRAINT CK_Vacaciones_DiasSolicitados
        CHECK (
            DiasSolicitados > 0
            AND DiasSolicitados <= DATEDIFF(DAY, FechaInicio, FechaFin) + 1
        )
);


/* 2. SALDO POR COLABORADOR */

CREATE TABLE dbo.SaldosVacaciones (
    ColaboradorId INT NOT NULL,

    DiasAcumulados DECIMAL(8,2) NOT NULL
        CONSTRAINT DF_SaldosVacaciones_DiasAcumulados
        DEFAULT (0),

    DiasUtilizados DECIMAL(8,2) NOT NULL
        CONSTRAINT DF_SaldosVacaciones_DiasUtilizados
        DEFAULT (0),

    DiasDisponibles AS (DiasAcumulados - DiasUtilizados) PERSISTED,

    FechaAcumuladaHasta DATE NOT NULL,

    CONSTRAINT PK_SaldosVacaciones
        PRIMARY KEY (ColaboradorId),

    CONSTRAINT FK_SaldosVacaciones_Colaboradores
        FOREIGN KEY (ColaboradorId)
        REFERENCES dbo.Colaboradores(ColaboradorId),

    CONSTRAINT CK_SaldosVacaciones_Dias
        CHECK (
            DiasAcumulados >= 0
            AND DiasUtilizados >= 0
            AND DiasUtilizados <= DiasAcumulados
        )
);


/* 3. RECONOCIMIENTO POR PERÍODO DE PLANILLA */

CREATE TABLE dbo.CalculosVacaciones (
    CalculoVacacionId INT IDENTITY(1,1) NOT NULL,
    SolicitudId INT NOT NULL,
    PeriodoId INT NOT NULL,

    FechaInicioReconocida DATE NOT NULL,
    FechaFinReconocida DATE NOT NULL,
    DiasReconocidos INT NOT NULL,
    MinutosReconocidos INT NOT NULL,

    CONSTRAINT PK_CalculosVacaciones
        PRIMARY KEY (CalculoVacacionId),

    CONSTRAINT FK_CalculosVacaciones_Vacaciones
        FOREIGN KEY (SolicitudId)
        REFERENCES dbo.Vacaciones(SolicitudId),

    CONSTRAINT FK_CalculosVacaciones_PeriodosPlanilla
        FOREIGN KEY (PeriodoId)
        REFERENCES dbo.PeriodosPlanilla(PeriodoId),

    CONSTRAINT UQ_CalculosVacaciones_SolicitudPeriodo
        UNIQUE (SolicitudId, PeriodoId),

    CONSTRAINT CK_CalculosVacaciones_Fechas
        CHECK (FechaFinReconocida >= FechaInicioReconocida),

    CONSTRAINT CK_CalculosVacaciones_Dias
        CHECK (
            DiasReconocidos > 0
            AND DiasReconocidos <=
                DATEDIFF(
                    DAY,
                    FechaInicioReconocida,
                    FechaFinReconocida
                ) + 1
        ),

    CONSTRAINT CK_CalculosVacaciones_Minutos
        CHECK (MinutosReconocidos >= 0)
);