import { useEffect, useState } from "react";

function getInitialTheme() {
  try {
    const savedTheme = localStorage.getItem("planilla-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
  } catch {
    // Si el navegador bloquea el almacenamiento, usamos su preferencia.
  }

  const prefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;

  return prefersDark ? "dark" : "light";
}

export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem("planilla-theme", theme);
    } catch {
      // El tema funciona aunque no se pueda guardar la preferencia.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === "light" ? "dark" : "light",
    );
  }

  return {
    theme,
    toggleTheme,
  };
}