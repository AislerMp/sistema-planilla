import { useState } from "react";
import { Outlet } from "react-router";

import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import useTheme from "../../hooks/useTheme.js";

export default function AppLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  function toggleMenu() {
    setIsMenuOpen((currentValue) => !currentValue);
  }

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={isMenuOpen}
        onNavigate={closeMenu}
      />

      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        isMenuOpen={isMenuOpen}
        onToggleMenu={toggleMenu}
      />

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
