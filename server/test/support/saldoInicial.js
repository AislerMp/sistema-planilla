// Consultas que agrega la inicializacion de vacaciones al crear un colaborador.
export function esperarSaldoInicial(responder, colaboradorId = 12) {
  const fecha = new Date("2026-01-10T00:00:00Z");
  responder(/FROM Colaboradores/, [{ ColaboradorId: colaboradorId, FechaIngreso: fecha }]);
  responder(/FROM dbo.SaldosVacaciones/, []);
  responder(/INSERT INTO dbo.SaldosVacaciones/, [{
    ColaboradorId: colaboradorId,
    DiasAcumulados: 0,
    DiasUtilizados: 0,
    DiasDisponibles: 0,
    FechaAcumuladaHasta: fecha,
  }]);
  responder(/INSERT INTO dbo.Bitacora/);
}
