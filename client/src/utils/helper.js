export async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const errorData = contentType.includes("application/json")
      ? await response.json()
      : { message: await response.text() };

    throw new Error(errorData.message || "Error en la petición");
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export function crearQuery(filtros) {
  const params = new URLSearchParams();
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.set(campo, valor);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}