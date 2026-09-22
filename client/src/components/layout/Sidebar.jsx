import { NavLink, Link } from "react-router-dom";
import { House, MapPin } from "lucide-react";

import { menuItems } from "../../utils/menuItems.js";

import Brand from "../Brand.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Sidebar({ isOpen, onNavigate }) {
  function linkClass({ isActive }) {
    return "sidebar-link " + (isActive ? "sidebar-link--active" : "");
  }

  const { user } = useAuth();
  const visibleItems = menuItems.filter(
    (item) => !item.nonPermision.includes(user?.Rol),
  );
  return (
    <aside
      id="main-sidebar"
      className={"sidebar " + (isOpen ? "sidebar--open" : "")}
    >
      <Link
        to="/inicio"
        onClick={onNavigate}
        className="brand-link"
        aria-label="Planilla, ir al inicio"
      >
        <Brand />
      </Link>
      <nav aria-label="Navegación principal">
        <NavLink to="/inicio" onClick={onNavigate} className={linkClass}>
          <House size={19} />
          Inicio
        </NavLink>

        {visibleItems.length > 0 && (
          <>
            <p className="sidebar-section">
              {user?.Rol === "GERENTE" ? "MI RESTAURANTE" : "ADMINISTRACIÓN"}
            </p>
            <div className="sidebar-links">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    className={linkClass}
                  >
                    <Icon size={19} />
                    {item.title}
                  </NavLink>
                );
              })}
            </div>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <p>
          <MapPin size={15} />
          {user?.Rol === "GERENTE"
            ? "Tu restaurante asignado"
            : user?.Rol === "COLABORADOR"
              ? "Tu información personal"
              : "Todos los restaurantes"}
        </p>
        <span className="sidebar-session">Sesión activa</span>
      </div>
    </aside>
  );
}
