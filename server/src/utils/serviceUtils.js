export function serviceError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateId(value, field = "id", optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const id = typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))
    ? Number(value) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw serviceError(`${field} debe ser un entero positivo válido`);
  }
  return id;
}

export function validateText(value, field, maxLength, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw serviceError(`${field} es obligatorio y debe tener como máximo ${maxLength} caracteres`);
  }
  return value.trim();
}

export function validateStatus(value) {
  if (typeof value !== "boolean") throw serviceError("El estado debe ser un valor booleano");
  return value;
}

export function validateDate(value, field, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw serviceError(`${field} debe tener el formato YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw serviceError(`${field} no es una fecha válida`);
  }
  return date;
}
