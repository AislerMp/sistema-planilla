import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Users,
  Store,
  BriefcaseBusiness,
  UserRoundCog,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

import useAsyncRequest from "../hooks/useAsyncRequest.js";
import { getColaboradores } from "../services/colaboradores.Service.js";
import { getRestaurantes } from "../services/restaurantes.Service.js";
import { getPuestos } from "../services/puestos.Service.js";
import { getUsers } from "../services/auth.Service.js";

async function loadCounts() {
  const results = await Promise.allSettled([getColaboradores(), getRestaurantes("todos"), getPuestos("todos"), getUsers()]);
  return results.map(result => result.status === "fulfilled" ? result.value.filter(row => row.Activo).length : null);
}

const cards = [
  {
    title: "Colaboradores",
    path: "/colaboradores",
    icon: Users,
    description: "Las personas, sus puestos y sus asignaciones.",
    label: "colaboradores activos",
  },
  {
    title: "Restaurantes",
    path: "/restaurantes",
    icon: Store,
    description: "Ubicaciones y datos de cada restaurante.",
    label: "restaurantes activos",
  },
  {
    title: "Puestos",
    path: "/puestos",
    icon: BriefcaseBusiness,
    description: "Cargos y tarifas de pago por hora.",
    label: "puestos activos",
  },
  {
    title: "Usuarios",
    path: "/usuarios",
    icon: UserRoundCog,
    description: "Cuentas y perfiles de acceso al sistema.",
    label: "usuarios activos",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const { data: counts, isLoading } = useAsyncRequest(loadCounts);
  const displayName = user?.NombreUsuario ?? "Usuario";

  return (
    <>
      <div className="breadcrumb">
        Tu espacio / <span>Inicio</span>
      </div>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <p className="eyebrow accent">TU ESPACIO DE TRABAJO</p>
          <h1>
            Bienvenido, {displayName}
            <span className="accent">.</span>
          </h1>
          <p>
            Un equipo conectado empieza con todo en su lugar.
            <br className="desktop-break" /> Explorá la información de tu
            personal y tus restaurantes.
          </p>
          <Link to="/colaboradores" className="button button-primary">
            Ver colaboradores <ArrowRight size={18} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-logo">
            <img src="/images/kfc-logo.png" alt="" width="100" height="100" />
          </div>
          <div className="welcome-stripes">
            <i />
            <i />
            <i />
          </div>
          <span>SIEMPRE EN EQUIPO.</span>
        </div>
      </section>
      <section className="module-section" aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <h2 id="modules-title">Todo empieza aquí</h2>
            <p>Elegí el módulo con el que querés trabajar.</p>
          </div>
          <span className="subtle-tag">ADMINISTRACIÓN</span>
        </div>
        <div className="module-grid">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Link to={card.path} className="module-card" key={card.path}>
                <div className="module-card-top">
                  <span className="module-icon">
                    <Icon size={23} />
                  </span>
                  <ArrowUpRight className="card-arrow" size={20} />
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="module-card-bottom">
                  <strong>{isLoading || !counts ? "…" : counts[index] ?? "—"}</strong>
                  <span>{card.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      {counts?.some(count => count === null) && <p role="alert">No se pudieron cargar todas las cantidades. Ingresá al módulo para reintentar la consulta.</p>}
    </>
  );
}
