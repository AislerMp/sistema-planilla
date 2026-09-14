import { NavLink } from "react-router";
import {
  Users,
  Store,
  BriefcaseBusiness,
  UserRoundCog,
} from "lucide-react";

const menuItems = [
  {
    label: "Colaboradores",
    path: "/colaboradores",
    icon: Users,
  },
  {
    label: "Restaurantes",
    path: "/restaurantes",
    icon: Store,
  },
  {
    label: "Puestos",
    path: "/puestos",
    icon: BriefcaseBusiness,
  },
  {
    label: "Usuarios",
    path: "/usuarios",
    icon: UserRoundCog,
  },
];

export default function Sidebar({ isOpen, onNavigate }) {
  return (
    <aside
      id="main-sidebar"
      className={`sidebar ${isOpen ? "sidebar--open" : ""}`}
    >
      <div className="sidebar-brand">
        <div className="brand-stripes" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div>
          <strong>KFC · Planilla</strong>
          <small>Gestión de personal</small>
        </div>
      </div>

      <nav aria-label="Navegación principal">
        <p className="sidebar-section">Administración</p>

        <div className="sidebar-links">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "sidebar-link--active" : ""}`
                }
              >
                <Icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}