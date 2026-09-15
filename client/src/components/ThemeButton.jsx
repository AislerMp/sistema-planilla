import { Moon, Sun } from "lucide-react";

export default function ThemeButton({ theme, onToggleTheme }) {
  const isDark = theme === "dark";
  return (
    <button
      className="button button-secondary theme-button"
      type="button"
      onClick={onToggleTheme}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
    >
      <span className="theme-icon" key={theme}>
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </span>
      <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
    </button>
  );
}
