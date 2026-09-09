import useApiHealth from "../hooks/useApiHealth.js";

export default function HomePage() {
  const { data, isLoading, error, checkHealth } = useApiHealth();

  return (
    <main className="container">
      <section className="card">
        <h1>Sistema de planilla</h1>
        <p>Pantalla de desarrollo para comprobar la conexión con la API.</p>

        <button
          type="button"
          onClick={checkHealth}
          disabled={isLoading}
        >
          {isLoading ? "Consultando..." : "Comprobar conexión"}
        </button>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {data && (
          <div className="result" role="status">
            <p>
              <strong>Estado:</strong> {data.status}
            </p>
            <p>{data.message}</p>
          </div>
        )}
      </section>
    </main>
  );
}