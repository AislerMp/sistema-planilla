import AppRoutes from "./routes/AppRoutes.jsx";
import useTheme from "./hooks/useTheme.js";
import { AuthProvider } from "./context/AuthContext.jsx";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  return (
    <AuthProvider>
      <AppRoutes theme={theme} onToggleTheme={toggleTheme} />
    </AuthProvider>
  );
}
