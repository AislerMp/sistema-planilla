import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  return (
    <section className="empty-state not-found">
      <p className="eyebrow accent">404</p>
      <h1>Esta página no está en el menú.</h1>
      <p>Volvé al inicio para seguir explorando el diseño.</p>
      <Link to="/inicio" className="button button-primary">
        <ArrowLeft size={18} />
        Volver al inicio
      </Link>
    </section>
  );
}
