import { NavLink, Link } from "react-router-dom";
import {
  House,
  Users,
  Store,
  BriefcaseBusiness,
  UserRoundCog,
  MapPin,
} from "lucide-react";
import Brand from "../Brand.jsx";

const menuItems = [
  { label: "Colaboradores", path: "/colaboradores", icon: Users },
  { label: "Restaurantes", path: "/restaurantes", icon: Store },
  { label: "Puestos", path: "/puestos", icon: BriefcaseBusiness },
  { label: "Usuarios", path: "/usuarios", icon: UserRoundCog },
];

export default function Sidebar({ isOpen, onNavigate }) {
  function linkClass({ isActive }) {
    return "sidebar-link " + (isActive ? "sidebar-link--active" : "");
  }

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
        <p className="sidebar-section">ADMINISTRACIÓN</p>
        <div className="sidebar-links">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={linkClass}
              >
                <Icon size={19} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
      <div className="sidebar-footer">
        <p>
          <MapPin size={15} />
          Todos los restaurantes
        </p>
        <span className="sidebar-session">
          Sesión activa
        </span>
      </div>
    </aside>
  );
}
