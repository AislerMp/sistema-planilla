import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.jsx";
import RestaurantesDashboard from "../pages/restaurantes/RestaurantesDashboard.jsx";
import PuestosDashboard from "../pages/puestos/PuestosDashboard.jsx";
import HomePage from "../pages/homePage.jsx";
import Login from "../pages/login.jsx";
import NotFoundPage from "../pages/notFoundPage.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

import ColaboradoresDashboard from "../pages/colaboradores/colaboradoresDashboard.jsx";
import CreateColaborador from "../pages/colaboradores/createColaborador.jsx";
import UpdateColaborador from "../pages/colaboradores/updateColaborador.jsx";
import UsuariosDashboard from "../pages/usuarios/usuariosDashboard.jsx";
import CreateUsuario from "../pages/usuarios/createUsuario.jsx";
import UpdateUsuario from "../pages/usuarios/updateUsuario.jsx";
export default function AppRoutes({ theme, onToggleTheme }) {
  return (
    <BrowserRouter>
      <Routes>
        {/* RUTAS PUBLICAS */}
        <Route path="/" element={<Navigate to="/inicio" replace />} />
        <Route
          path="/login"
          element={<Login theme={theme} onToggleTheme={onToggleTheme} />}
        />

        {/* RUTAS PROTEGIDAS */}
        <Route element={<ProtectedRoute />}>
          <Route
            element={<AppLayout theme={theme} onToggleTheme={onToggleTheme} />}
          >
            <Route path="/inicio" element={<HomePage />} />
            <Route path="/usuarios/registrar" element={<CreateUsuario />} />
            <Route path="/usuarios/:usuarioId/editar" element={<UpdateUsuario />} />

            <Route path="/colaboradores" element={<ColaboradoresDashboard />} />
            <Route path="/colaboradores/registrar" element={<CreateColaborador />} />
            <Route
              path="/colaboradores/:colaboradorId/editar"
              element={<UpdateColaborador />}
            />
            <Route
              path="/restaurantes"
              element={<RestaurantesDashboard />}
            />
            <Route
              path="/puestos"
              element={<PuestosDashboard />}
            />
            <Route
              path="/usuarios"
              element={<UsuariosDashboard />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
