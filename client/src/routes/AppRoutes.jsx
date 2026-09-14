import { BrowserRouter, Routes, Route, Navigate } from "react-router";

import AppLayout from "../components/layout/AppLayout.jsx";
import ModuloPage from "../pages/ModuloPage.jsx";
import HomePage from "../pages/homePage.jsx";
export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/colaboradores" replace />} />

          <Route
            path="/colaboradores"
            element={
              <ModuloPage
                title="Colaboradores"
                description="Consultá y administrá los datos del personal."
              />
            }
          />
          <Route path="/homepage" element={<HomePage />} />

          <Route
            path="/restaurantes"
            element={
              <ModuloPage
                title="Restaurantes"
                description="Administrá los restaurantes y sus ubicaciones."
              />
            }
          />

          <Route
            path="/puestos"
            element={
              <ModuloPage
                title="Puestos"
                description="Consultá los puestos y sus tarifas por hora."
              />
            }
          />

          <Route
            path="/usuarios"
            element={
              <ModuloPage
                title="Usuarios"
                description="Administrá las cuentas y sus perfiles de acceso."
              />
            }
          />

          <Route
            path="*"
            element={
              <ModuloPage
                title="Página no encontrada"
                description="Seleccioná una opción del menú para continuar."
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
