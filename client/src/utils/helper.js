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