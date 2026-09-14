import { Menu, Moon, Sun } from "lucide-react";

export default function Header({
  theme,
  onToggleTheme,
  isMenuOpen,
  onToggleMenu,
}) {
  const isDark = theme === "dark";

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-button menu-button"
          onClick={onToggleMenu}
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isMenuOpen}
          aria-controls="main-sidebar"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <span className="header-title">
          Gestión de pagos de planilla
        </span>
      </div>

      <button
        type="button"
        className="button button-secondary"
        onClick={onToggleTheme}
        aria-label={
          isDark ? "Activar modo claro" : "Activar modo oscuro"
        }
      >
        {isDark ? (
          <Sun size={18} aria-hidden="true" />
        ) : (
          <Moon size={18} aria-hidden="true" />
        )}

        <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
      </button>
    </header>
  );
}