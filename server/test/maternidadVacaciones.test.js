import assert from "node:assert/strict";
import { test } from "node:test";

// Servicios y repositorios reales con requests simulados. No usa .env ni SQL Server.
Object.assign(process.env, {
  DB_SERVER: "test.invalid", DB_PORT: "1433", DB_NAME: "test",
  DB_USER: "test", DB_PASSWORD: "test",
});
const { registrarReconocimientoMaternidad } = await import(
  "../src/modules/incapacidades/services/calculoIncapacidades.services.js"
);
const { acumularVacacionesColaborador } = await import(
  "../src/modules/vacaciones/services/saldosVacaciones.service.js"
);

const fecha = (texto) => new Date(`${texto}T00:00:00Z`);
const asistencia = (dia, minutos = 480) => ({
  FechaAsignada: fecha(dia), MinutosEfectivos: minutos,
});
const tipoMaternidad = {
  TipoIncapacidadId: 3, Codigo: "MATERNIDAD_CCSS", PorcentajePatronal: 50,
};

function preparar(t, opciones = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: fecha("2026-10-19") });
  const solicitud = {
    SolicitudId: 21, ColaboradorId: 2018, TipoIncapacidadId: 3,
    CodigoTipoIncapacidad: "MATERNIDAD_CCSS",
    FechaInicio: fecha("2026-10-20"), FechaFin: fecha("2026-12-18"),
    Estado: "APROBADA", ...opciones.solicitud,
  };
  const saldoInicial = opciones.sinSaldo ? null : {
    ColaboradorId: 2018, DiasAcumulados: 6, DiasUtilizados: 1.25,
    FechaAcumuladaHasta: fecha("2026-10-19"), ...opciones.saldo,
  };
  let saldo = saldoInicial && { ...saldoInicial };
  const asistencias = opciones.asistencias ?? [];
  const calculos = [];
  const eventos = [];
  const auditorias = [];
  const transaction = {
    commit() { assert.fail("El helper no debe confirmar la transacción de RH"); },
    rollback() { assert.fail("El helper no debe revertir la transacción de RH"); },
    request() {
      const parametros = {};
      return {
        input(nombre, _tipo, valor) {
          parametros[nombre.toLowerCase()] = valor;
          return this;
        },
        async query(query) {
          const p = parametros;
          eventos.push({ query, parametros: p });
          if (query.includes("WITH (UPDLOCK, HOLDLOCK)")) {
            return { recordset: [{ ColaboradorId: 2018 }] };
          }
          if (query.includes("FROM dbo.Solicitudes AS s")) {
            return { recordset: [{ ...solicitud }] };
          }
          if (query.includes("FROM dbo.CalculosIncapacidad")) {
            return { recordset: [...calculos] };
          }
          if (query.includes("FROM dbo.SaldosVacaciones")) {
            return { recordset: saldo ? [{ ...saldo }] : [] };
          }
          if (query.includes("FROM dbo.AsistenciasDiarias")) {
            // La consulta puntual del primer día no encuentra una asistencia.
            // Las pruebas de aportes previos usan otras fechas de la licencia.
            if (p.fechaasignada) return { recordset: [] };
            return { recordset: asistencias.filter((a) =>
              a.FechaAsignada >= p.desde && a.FechaAsignada <= p.hasta) };
          }
          if (query.includes("FROM dbo.Incapacidades") && !query.includes("INSERT INTO")) {
            assert.equal(p.estado, "APROBADA");
            return { recordset: solicitud.Estado === p.estado ? [{ ...solicitud }] : [] };
          }
          if (query.includes("FROM dbo.PermisosLaborales")) {
            return { recordset: [] };
          }
          if (query.includes("FROM dbo.PeriodosPlanilla")) {
            return { recordset: [{
              PeriodoId: 41, Estado: "PROGRAMADO",
              FechaInicio: fecha("2026-10-12"), FechaFin: fecha("2026-12-20"),
              FechaLimiteAjustes: fecha("2027-01-01"),
            }] };
          }
          if (query.includes("INSERT INTO dbo.CalculosIncapacidad")) {
            const calculo = {
              CalculoId: calculos.length + 1, SolicitudId: p.solicitudid,
              PeriodoId: p.periodoid, MinutosReconocidos: p.minutosreconocidos,
              PorcentajePatronalAplicado: p.porcentajepatronalaplicado,
            };
            calculos.push(calculo);
            return { recordset: [calculo] };
          }
          if (query.includes("UPDATE dbo.SaldosVacaciones")) {
            assert.doesNotMatch(query, /SET\s+DiasUtilizados\s*=/);
            saldo = {
              ...saldo, DiasAcumulados: p.diasacumulados,
              FechaAcumuladaHasta: p.fechaacumuladahasta,
              DiasDisponibles: Number((p.diasacumulados - saldo.DiasUtilizados).toFixed(2)),
            };
            return { recordset: [{ ...saldo }] };
          }
          if (query.includes("INSERT INTO dbo.Bitacora")) {
            auditorias.push({
              anteriores: JSON.parse(p.datosanteriores), nuevos: JSON.parse(p.datosnuevos),
            });
            return { rowsAffected: [1] };
          }
          throw new Error(`Consulta no simulada: ${query}`);
        },
      };
    },
  };
  const registrar = () => registrarReconocimientoMaternidad(
    solicitud, tipoMaternidad, 7, transaction,
  );
  return {
    registrar, solicitud, transaction, saldoInicial, calculos, eventos, auditorias,
    get saldo() { return saldo; },
  };
}

test("60 días de maternidad sin aportes previos acreditan 2.40 y conservan utilizados y corte", async (t) => {
  const bd = preparar(t);
  const resultado = await bd.registrar();
  assert.equal(resultado.diasReconocidos, 60);
  assert.equal(resultado.aporteVacaciones, 2.4);
  assert.equal(resultado.aporteVacaciones.toFixed(2), "2.40");
  assert.equal(bd.saldo.DiasAcumulados, 8.4);
  assert.equal(bd.saldo.DiasUtilizados, bd.saldoInicial.DiasUtilizados);
  assert.equal(bd.saldo.FechaAcumuladaHasta.getTime(), bd.saldoInicial.FechaAcumuladaHasta.getTime());
  assert.equal(bd.auditorias[0].nuevos.diasYaContabilizados, 0);
});

test("tres fechas que ya aportaron 0.12 reducen el crédito pendiente a 2.28", async (t) => {
  const bd = preparar(t, {
    saldo: { DiasAcumulados: 6.12, FechaAcumuladaHasta: fecha("2026-10-23") },
    asistencias: ["2026-10-21", "2026-10-22", "2026-10-23"].map((dia) => asistencia(dia)),
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.aporteVacaciones, 2.28);
  assert.equal(bd.saldo.DiasAcumulados, 8.4);
  assert.equal(bd.auditorias[0].nuevos.diasYaContabilizados, 3);
});

test("asistencias repetidas de una fecha solo descuentan un aporte previo", async (t) => {
  const bd = preparar(t, {
    saldo: { FechaAcumuladaHasta: fecha("2026-10-22") },
    asistencias: [asistencia("2026-10-21"), asistencia("2026-10-21"), asistencia("2026-10-22")],
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.aporteVacaciones, 2.32);
  assert.equal(bd.auditorias[0].nuevos.diasYaContabilizados, 2);
});

test("cero minutos y asistencias posteriores al corte no se descuentan del crédito", async (t) => {
  const bd = preparar(t, {
    saldo: { FechaAcumuladaHasta: fecha("2026-10-22") },
    asistencias: [asistencia("2026-10-21", 0), asistencia("2026-10-22", null), asistencia("2026-10-23")],
  });
  assert.equal((await bd.registrar()).aporteVacaciones, 2.4);
  assert.equal(bd.auditorias[0].nuevos.diasYaContabilizados, 0);
  const consulta = bd.eventos.find((e) => e.query.includes("FROM dbo.AsistenciasDiarias"));
  assert.equal(consulta.parametros.hasta.toISOString().slice(0, 10), "2026-10-22");
});

test("una licencia parcialmente procesada conserva el corte y acredita solamente el resto", async (t) => {
  const bd = preparar(t, {
    solicitud: { FechaFin: fecha("2026-10-25") },
    saldo: { DiasAcumulados: 6.08, FechaAcumuladaHasta: fecha("2026-10-22") },
    asistencias: [asistencia("2026-10-21"), asistencia("2026-10-22"), asistencia("2026-10-23")],
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.diasReconocidos, 6);
  assert.equal(resultado.aporteVacaciones, 0.16);
  assert.equal(bd.saldo.DiasAcumulados, 6.24);
  assert.equal(bd.saldo.FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-10-22");
});

test("saldo inexistente impide insertar cálculos o modificar saldos", async (t) => {
  const bd = preparar(t, { sinSaldo: true });
  await assert.rejects(bd.registrar(), { status: 409 });
  assert.equal(bd.calculos.length, 0);
  assert.equal(bd.eventos.some((e) => e.query.includes("UPDATE dbo.SaldosVacaciones")), false);
});

test("repetir el reconocimiento no duplica ni cálculos ni aporte", async (t) => {
  const bd = preparar(t);
  await bd.registrar();
  const saldoTrasPrimera = { ...bd.saldo };
  await assert.rejects(bd.registrar(), { status: 409 });
  assert.equal(bd.calculos.length, 1);
  assert.deepEqual(bd.saldo, saldoTrasPrimera);
  assert.equal(bd.auditorias.length, 1);
});

test("la tarea diaria posterior al abono anticipado excluye toda la maternidad aprobada", async (t) => {
  const bd = preparar(t, {
    asistencias: [asistencia("2026-10-21"), asistencia("2026-11-10"), asistencia("2026-12-18")],
  });
  await bd.registrar();
  const acumuladoAnticipado = bd.saldo.DiasAcumulados;
  const resultado = await acumularVacacionesColaborador(2018, "2026-12-18", 7, bd.transaction);
  assert.equal(resultado.DiasAcumulados, acumuladoAnticipado);
  assert.equal(resultado.DiasUtilizados, 1.25);
  assert.equal(resultado.FechaAcumuladaHasta.toISOString().slice(0, 10), "2026-12-18");
  assert.equal(bd.auditorias.at(-1).nuevos.diasLaboradosProcesados, 0);
  assert.equal(bd.auditorias.at(-1).nuevos.diasGanadosPorDescanso, 0);
  assert.equal(bd.auditorias.at(-1).nuevos.diasGanados, 0);
  const escrituras = bd.eventos.filter((e) => e.query.includes("UPDATE dbo.SaldosVacaciones")).length;
  await acumularVacacionesColaborador(2018, "2026-12-18", 7, bd.transaction);
  assert.equal(bd.eventos.filter((e) => e.query.includes("UPDATE dbo.SaldosVacaciones")).length, escrituras);
});

test("el abono no impide acumular trabajo fuera de las fechas de maternidad", async (t) => {
  const bd = preparar(t, {
    solicitud: { FechaFin: fecha("2026-10-22") },
    asistencias: [asistencia("2026-10-21"), asistencia("2026-10-23")],
  });
  await bd.registrar();
  assert.equal(bd.saldo.DiasAcumulados, 6.12);
  await acumularVacacionesColaborador(2018, "2026-10-23", 7, bd.transaction);
  assert.equal(bd.saldo.DiasAcumulados, 6.16);
  assert.equal(bd.auditorias.at(-1).nuevos.diasLaboradosProcesados, 1);
});

test("el descanso semanal no duplica un domingo ya acreditado por maternidad", async (t) => {
  const bd = preparar(t, {
    solicitud: { FechaFin: fecha("2026-10-25") },
    asistencias: [asistencia("2026-10-19")],
  });
  await bd.registrar();
  assert.equal(bd.saldo.DiasAcumulados, 6.24);
  await acumularVacacionesColaborador(2018, "2026-10-25", 7, bd.transaction);
  assert.equal(bd.saldo.DiasAcumulados, 6.24);
  assert.equal(bd.auditorias.at(-1).nuevos.diasGanadosPorDescanso, 0);
});

test("el descanso semanal fuera de maternidad conserva su aporte normal", async (t) => {
  const bd = preparar(t, {
    solicitud: { FechaFin: fecha("2026-10-22") },
    asistencias: [asistencia("2026-10-19")],
  });
  await bd.registrar();
  assert.equal(bd.saldo.DiasAcumulados, 6.12);
  await acumularVacacionesColaborador(2018, "2026-10-25", 7, bd.transaction);
  assert.equal(bd.saldo.DiasAcumulados, 6.16);
  assert.equal(bd.auditorias.at(-1).nuevos.diasGanadosPorDescanso, 0.04);
});

test("enfermedad común conserva el descanso semanal si hubo trabajo fuera de su rango", async (t) => {
  const bd = preparar(t, {
    solicitud: {
      TipoIncapacidadId: 1, CodigoTipoIncapacidad: "ENFERMEDAD_CCSS",
      FechaFin: fecha("2026-10-25"),
    },
    asistencias: [asistencia("2026-10-19")],
  });
  await acumularVacacionesColaborador(2018, "2026-10-25", 7, bd.transaction);
  assert.equal(bd.saldo.DiasAcumulados, 6.04);
  assert.equal(bd.auditorias.at(-1).nuevos.diasGanadosPorDescanso, 0.04);
});

// Pruebas de caracterización: muestran una limitación vigente, no una solución.
// No hay historial por fecha que permita comprobar el origen real del saldo.
test("limitación: un saldo manual sin aportes diarios puede hacer inferir tres aportes inexistentes", async (t) => {
  const bd = preparar(t, {
    saldo: { DiasAcumulados: 0, DiasUtilizados: 0, FechaAcumuladaHasta: fecha("2026-10-23") },
    asistencias: ["2026-10-21", "2026-10-22", "2026-10-23"].map((dia) => asistencia(dia)),
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.aporteVacaciones, 2.28);
  assert.equal(bd.saldo.DiasAcumulados, 2.28);
  // El saldo fue creado manualmente en cero: ninguna de esas fechas había aportado.
  assert.notEqual(bd.saldo.DiasAcumulados, 2.4);
});

test("limitación: asistencias cambiadas a cero ocultan 0.12 aportados previamente", async (t) => {
  const bd = preparar(t, {
    saldo: { DiasAcumulados: 0.12, DiasUtilizados: 0, FechaAcumuladaHasta: fecha("2026-10-23") },
    asistencias: ["2026-10-21", "2026-10-22", "2026-10-23"].map((dia) => asistencia(dia, 0)),
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.aporteVacaciones, 2.4);
  assert.equal(bd.saldo.DiasAcumulados, 2.52);
  // Los 0.12 ya existían: correspondería terminar con 2.40, no con 2.52.
  assert.notEqual(bd.saldo.DiasAcumulados, 2.4);
});

test("limitación: el descanso semanal previo no queda identificado por asistencias dentro de la licencia", async (t) => {
  const bd = preparar(t, {
    solicitud: { FechaFin: fecha("2026-10-25") },
    // El lunes 19 aportó 0.04 y el descanso del domingo 25 aportó otros 0.04.
    saldo: { DiasAcumulados: 0.08, DiasUtilizados: 0, FechaAcumuladaHasta: fecha("2026-10-25") },
    asistencias: [asistencia("2026-10-19")],
  });
  const resultado = await bd.registrar();
  assert.equal(resultado.aporteVacaciones, 0.24);
  assert.equal(bd.saldo.DiasAcumulados, 0.32);
  // Debiera conservar el lunes fuera de licencia y completar los seis días: 0.04 + 0.24.
  assert.notEqual(bd.saldo.DiasAcumulados, 0.28);
});
