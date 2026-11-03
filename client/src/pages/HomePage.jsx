import { Link } from "react-router-dom";
import { ArrowRight, Clock3, ClipboardList } from "lucide-react";
import { menuItems, groupMenuItems } from "../utils/menuItems.js";
import { useAuth } from "../context/AuthContext.jsx";

const collaboratorCards = [
  {
    title: "Registrar mi jornada",
    path: "/asistencia",
    group: "administracion",
    icon: Clock3,
    description: "Marcá tu entrada o salida de la jornada de trabajo.",
  },
  {
    title: "Consultar mis marcas",
    path: "/asistencia/mis-marcas",
    group: "administracion",
    icon: ClipboardList,
    description: "Revisá tus entradas y salidas por fecha.",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const displayName = user?.NombreUsuario ?? "Usuario";
  const isCollaborator = user?.Rol === "COLABORADOR";
  const visibleItems = menuItems.filter(
    (item) => !item.nonPermision.includes(user?.Rol),
  );
  const cards = isCollaborator
    ? [
        ...visibleItems.filter((item) => item.path !== "/asistencia"),
        ...collaboratorCards,
      ]
    : visibleItems;
  const groups = groupMenuItems(cards);

  return (
    <div className="home-page">
      <div className="breadcrumb">
        Tu espacio / <span>Inicio</span>
      </div>

      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow accent">TU ESPACIO DE TRABAJO</p>
          <h1 id="welcome-title">Bienvenido, {displayName}.</h1>
          <p>
            {isCollaborator
              ? "Consultá tus pagos, registrá tu jornada y seguí tus solicitudes."
              : "Gestioná la planilla y las tareas de tu equipo desde un solo lugar."}
          </p>
          <div className="home-quick-actions">
            <Link to="/planillas" className="button button-primary">
              {isCollaborator ? "Consultar mi planilla" : "Ir a planillas"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/asistencia" className="button button-secondary">
              <Clock3 size={16} aria-hidden="true" />
              {isCollaborator ? "Registrar mi jornada" : "Marcas y asistencias"}
            </Link>
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-logo">
            <img src="/images/kfc-logo.png" alt="" width="100" height="100" />
          </div>
          <div className="welcome-stripes"><i /><i /><i /></div>
          <span>SIEMPRE EN EQUIPO.</span>
        </div>
      </section>

      <section className="home-modules" aria-labelledby="modules-title">
        <div className="home-modules-heading">
          <h2 id="modules-title">Módulos del sistema</h2>
          <p>Accesos organizados según tu trabajo.</p>
        </div>
        <div className="home-module-groups">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                className="home-module-group"
                key={group.id}
                aria-labelledby={`modules-${group.id}`}
              >
                <div className="home-group-heading">
                  <span className="home-group-icon" aria-hidden="true">
                    <GroupIcon size={18} />
                  </span>
                  <div>
                    <h3 id={`modules-${group.id}`}>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                </div>
                <div
                  className="home-module-grid"
                  style={{ "--home-columns": group.items.length === 4 ? 2 : Math.min(group.items.length, 3) }}
                >
                  {group.items.map((card) => {
                    const Icon = card.icon;
                    return (
                      <Link
                        to={card.path}
                        className={`home-module-card${card.path === "/planillas" ? " home-module-card--primary" : ""}`}
                        key={card.path}
                      >
                        <span className="home-module-icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <div className="home-module-copy">
                          <h4>{card.title}</h4>
                          <p>{card.description}</p>
                        </div>
                        <ArrowRight className="home-module-arrow" size={16} aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
