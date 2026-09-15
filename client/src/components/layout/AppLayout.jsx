import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";

export default function AppLayout({ theme, onToggleTheme }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      contentRef.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div
      className="app-layout"
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsMenuOpen(false);
      }}
    >
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <Sidebar isOpen={isMenuOpen} onNavigate={() => setIsMenuOpen(false)} />
      <Header
        theme={theme}
        onToggleTheme={onToggleTheme}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
      />
      <main
        className="app-main"
        id="main-content"
        ref={contentRef}
        tabIndex={-1}
      >
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
        <footer className="app-footer">
          <span>Hecho para quienes hacen la diferencia.</span>
          <span>
            Sesión activa
          </span>
        </footer>
      </main>
    </div>
  );
}
