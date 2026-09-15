import { useState, useEffect } from "react";

export default function useAsyncRequest(requestFn, deps = []) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const runFn = async () => {
      try {
        if (mounted) { setIsLoading(true); setError(null); }
        const result = await requestFn();
        if (mounted) setData(result); 
      } catch (err) {
        if (mounted) setError(err.message); 
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    runFn();

    return () => { mounted = false; };
  }, deps);
  return { data, isLoading, error };
}
