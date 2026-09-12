import { AppError } from "../utils/AppError.js";

export function notFound(req, res) {
  res.status(404).json({
    message: "Ruta no encontrada",
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const candidate = err?.status ?? err?.statusCode;
  const status =
    Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
      ? candidate
      : 500;

  const publicMessage = err instanceof AppError && status < 500;

  if (status >= 500) console.error(err);

  return res.status(status).json({
    message: publicMessage
      ? err.message
      : status === 400
        ? "Solicitud inválida"
        : "No fue posible procesar la solicitud",
  });
}
