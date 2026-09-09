const API_URL = import.meta.env.VITE_API_URL;

export async function getHealth() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }

  const response = await fetch(`${API_URL}/health`);

  if (!response.ok) {
    throw new Error(`La API respondió con un error HTTP ${response.status}`);
  }

  return response.json();
}