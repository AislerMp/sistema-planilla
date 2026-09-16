import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import LoadingState from "../components/loadingState.jsx";

export default function ProtectedRoute() {
  const { user, isCheckingSession } = useAuth();
  const location = useLocation();

  if (isCheckingSession) {
    return (
      <main className="session-loading">
        <LoadingState
          mensaje="Comprobando sesión..."
          descripcion="Estamos preparando tu espacio de trabajo."
        />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
