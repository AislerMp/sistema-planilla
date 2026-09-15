import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute() {
  const { user, isCheckingSession } = useAuth();
  const location = useLocation();

  if (isCheckingSession) {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" />
        <p>Comprobando sesión...</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
