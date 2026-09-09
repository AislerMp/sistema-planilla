import { useState } from "react";
import { getHealth } from "../services/health.service.js";

export default function useApiHealth() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkHealth() {
    setIsLoading(true);
    setError("");
    setData(null);

    try {
      const result = await getHealth();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible consultar la API",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return {
    data,
    isLoading,
    error,
    checkHealth,
  };
}