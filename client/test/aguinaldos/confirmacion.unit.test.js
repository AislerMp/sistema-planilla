import { expect, jest, test } from "@jest/globals";

const fire = jest.fn();
jest.unstable_mockModule("sweetalert2/dist/sweetalert2.js", () => ({
  default: { fire },
}));

const { confirmarCalculoAguinaldo } = await import("../../src/utils/notifications.js");

test("confirma el año e informa que se registran todos los restaurantes sin filtros", async () => {
  fire.mockResolvedValueOnce({ isConfirmed: true });

  await expect(confirmarCalculoAguinaldo(2026)).resolves.toBe(true);

  const opciones = fire.mock.lastCall[0];
  expect(opciones.titleText).toContain("2026");
  expect(opciones.text).toContain("todos los restaurantes");
  expect(opciones.text).toContain("sin aplicar los filtros");
  expect(opciones.showCancelButton).toBe(true);
  expect(opciones.focusCancel).toBe(true);
});

test.each(["cancel", "esc", "backdrop", "close"])(
  "cerrar con %s no autoriza el registro del aguinaldo",
  async (dismiss) => {
    fire.mockResolvedValueOnce({ isConfirmed: false, isDismissed: true, dismiss });

    await expect(confirmarCalculoAguinaldo(2026)).resolves.toBe(false);
  },
);
