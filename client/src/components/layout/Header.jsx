import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ThemeButton from "../ThemeButton.jsx";
import AlertMessage from "../AlertMessage.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Header({
  theme,
  onToggleTheme,
  isMenuOpen,
  onToggleMenu,
}) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const profileRef = useRef(null);

  const displayName = user?.NombreUsuario ?? "Usuario";
  const displayRole = formatRole(user?.Rol);
  const initials = getInitials(displayName);

  useEffect(() => {
    function closeProfile(event) {
      if (!profileRef.current?.contains(event.target)) setIsProfileOpen(false);
    }

    function closeProfileWithKeyboard(event) {
      if (event.key === "Escape") setIsProfileOpen(false);
    }

    document.addEventListener("pointerdown", closeProfile);
    document.addEventListener("keydown", closeProfileWithKeyboard);

    return () => {
      document.removeEventListener("pointerdown", closeProfile);
      document.removeEventListener("keydown", closeProfileWithKeyboard);
    };
  }, []);

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="icon-button menu-button"
          type="button"
          onClick={onToggleMenu}
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isMenuOpen}
          aria-controls="main-sidebar"
        >
          {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="header-title">Gestión de pagos de planilla</span>
      </div>
      <div className="header-actions">
        <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        <div className="profile-menu" ref={profileRef}>
          <button
            type="button"
            className="profile"
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
            onClick={() => setIsProfileOpen((current) => !current)}
          >
            <span className="avatar profile-avatar">{initials}</span>
            <div className="profile-copy">
              <strong>{displayName}</strong>
              <span>{displayRole}</span>
            </div>
            <ChevronDown
              className={
                isProfileOpen
                  ? "profile-chevron profile-chevron--open"
                  : "profile-chevron"
              }
              size={16}
            />
          </button>

          {isProfileOpen && (
            <div className="profile-dropdown" role="menu">
              <div className="profile-dropdown-info">
                <strong>{displayName}</strong>
                <span>{displayRole}</span>
              </div>
              <button
                type="button"
                role="menuitem"
                className="logout-button"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                <LogOut size={17} />
                {isLoggingOut
                  ? "Cerrando sesión..."
                  : "Cerrar sesión"}
              </button>
              {logoutError && (
                <AlertMessage title="No se pudo cerrar sesión">
                  {logoutError}
                </AlertMessage>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function getInitials(name) {
  return name
    .split(/[._\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function formatRole(role) {
  if (!role) return "Usuario autenticado";

  return role
    .toLocaleLowerCase("es")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("es"));
}
