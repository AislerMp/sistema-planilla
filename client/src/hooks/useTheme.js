import { useEffect, useState } from "react";

export default function useTheme() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
