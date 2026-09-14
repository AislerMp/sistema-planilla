export default function ModuloPage({ title, description }) {
  return (
    <section>
      <div className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="panel empty-state">
        <h2>Vista en preparación</h2>
        <p>
          Aquí construiremos el listado y las acciones de este módulo.
        </p>
      </div>
    </section>
  );
}