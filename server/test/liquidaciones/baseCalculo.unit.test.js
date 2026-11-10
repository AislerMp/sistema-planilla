import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import * as validaciones from "../../src/shared/utils/serviceUtils.js";
import * as fechas from "../../src/shared/utils/fechaUtils.js";

// Se ejecuta el servicio real con sus consultas y dependencias SQL simuladas.
let colaborador;
const historico = jest.fn();
const ultimoSalario = jest.fn();
const beginTransaction = jest.fn();
const dependencias = {
  "../../shared/utils/serviceUtils.js": validaciones,
  "./liquidaciones.repository.js": { getLiquidacionByColaborador: async () => null },
  "../colaboradores/colaboradores.repository.js": { getColaboradorById: async () => colaborador },
  "../vacaciones/repositorios/saldosVacaciones.repository.js": { getSaldoByColaborador: async () => ({ DiasDisponibles: 3.4 }) },
  "../aguinaldos/aguinaldo.service.js": { calcularAguinaldo: async () => ({ totalAguinaldo: 20357.14 }) },
  "../periodoPlanilla/periodosPlanillas.repository.js": { getPeriodoByFecha: async () => ({ PeriodoId: 200 }) },
  "../planillas/repositories/detallesPlanilla.repository.js": { getSalariosParaPromedio: historico },
  "../planillas/services/detallesPlanilla.service.js": { calcularDetalleColaborador: ultimoSalario },
  "../../shared/utils/fechaUtils.js": fechas,
  "../../shared/config/database.js": { beginTransaction },
  "../bitacora/bitacora.service.js": { registrarBitacora: jest.fn(), entidades: {}, acciones: {} },
};
const fuente = await readFile(new URL("../../src/modules/liquidaciones/liquidaciones.service.js", import.meta.url), "utf8");
const modulo = new SourceTextModule(fuente);
await modulo.link((ruta) => {
  const exports = dependencias[ruta];
  if (!exports) throw new Error(`Dependencia inesperada: ${ruta}`);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [nombre, valor] of Object.entries(exports)) this.setExport(nombre, valor);
  });
});
await modulo.evaluate();
const { calcularLiquidacion } = modulo.namespace;
const actor = { UsuarioId: 1, Rol: "RECURSOS_HUMANOS" };
const datosSalida = { fechaSalida: "2026-11-06", motivoSalida: "DESPIDO_CON_RESPONSABILIDAD", diasPreavisoTrabajados: "0" };

beforeEach(() => {
  jest.clearAllMocks();
  colaborador = { ColaboradorId: 7, RestauranteId: 2, Activo: true, FechaIngreso: new Date("2024-12-11T00:00:00Z"), TarifaHora: 1900 };
  historico.mockResolvedValue([{ PeriodoId: 100, Monto: 3000000 }]);
  ultimoSalario.mockResolvedValue({ totalIngresos: 600000 });
});

test("devuelve la base exacta usada por el promedio, incluido el último período", async () => {
  const resultado = await calcularLiquidacion(actor, 7, datosSalida);
  expect(resultado.baseCalculo).toMatchObject({
    fechaIngreso: "2024-12-11",
    fechaSalida: "2026-11-06",
    tarifaHora: 1900,
    salarioDiarioVacaciones: 15200,
    promedioSalarial: {
      desde: "2026-05-06",
      hasta: "2026-11-06",
      mesesConsiderados: 6,
      salarioAcumulado: 3600000,
      salarioPromedioMensual: 600000,
      salarioDiario: 20000,
    },
  });
  expect(resultado.baseCalculo.antiguedadMeses).toBeGreaterThan(22);
  expect(ultimoSalario).toHaveBeenCalledTimes(1);
});

test("la base no duplica el último período cuando ya está en el historial", async () => {
  historico.mockResolvedValue([{ PeriodoId: 200, Monto: 3600000 }]);
  const resultado = await calcularLiquidacion(actor, 7, datosSalida);
  expect(ultimoSalario).not.toHaveBeenCalled();
  expect(resultado.baseCalculo.promedioSalarial.salarioAcumulado).toBe(3600000);
});

test("refleja el ingreso y el divisor reales cuando la antigüedad es de cuatro meses", async () => {
  colaborador.FechaIngreso = new Date("2026-07-06T00:00:00Z");
  historico.mockResolvedValue([{ PeriodoId: 100, Monto: 1200000 }]);
  const resultado = await calcularLiquidacion(actor, 7, datosSalida);
  expect(resultado.baseCalculo.antiguedadMeses).toBe(4);
  expect(resultado.baseCalculo.promedioSalarial).toMatchObject({
    desde: "2026-07-06", mesesConsiderados: 4,
    salarioAcumulado: 1800000, salarioPromedioMensual: 450000, salarioDiario: 15000,
  });
});

test("una renuncia no inventa un salario promedio que el cálculo no utilizó", async () => {
  const resultado = await calcularLiquidacion(actor, 7, { ...datosSalida, motivoSalida: "RENUNCIA" });
  expect(resultado.baseCalculo.promedioSalarial).toBeNull();
  expect(resultado.baseCalculo.tarifaHora).toBe(1900);
  expect(resultado.baseCalculo.salarioDiarioVacaciones).toBe(15200);
  expect(historico).not.toHaveBeenCalled();
});

afterEach(() => {
  expect(beginTransaction).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});
