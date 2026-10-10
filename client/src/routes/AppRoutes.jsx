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

import PeriodosPlanillaMenu from "../pages/periodos/periodoPlanillaMenu.jsx";
import PeriodosPlanillaList from "../pages/periodos/periodosPlanillaList.jsx";
import CreatePeriodoPlanilla from "../pages/periodos/createPeriodoPlanilla.jsx";
import AsistenciaMenu from "../pages/marcas&Asistencias/asistenciaMenu.jsx";
import MisMarcas from "../pages/marcas&Asistencias/misMarcas.jsx";
import GestionarAsistencias from "../pages/marcas&Asistencias/gestionarAsistencias.jsx";
import SolicitudesHorasExtra from "../pages/SolicitudesHorasExtra.jsx";
import PermisosLaborales from "../pages/PermisosLaborales.jsx";
import ConsultarBitacoras from "../pages/bitacoras/consultarBitacoras.jsx";
import DetalleBitacora from "../pages/bitacoras/detalleBitacora.jsx";

import ConsultarIncapacidades from "../pages/incapacidades/consultarIncapacidades.jsx";
import DetalleIncapacidad from "../pages/incapacidades/detalleIncapacidad.jsx";
import RegistrarIncapacidad from "../pages/incapacidades/registrarIncapacidad.jsx";

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
            <Route
              path="/usuarios/:usuarioId/editar"
              element={<UpdateUsuario />}
            />

            <Route path="/colaboradores" element={<ColaboradoresDashboard />} />
            <Route
              path="/colaboradores/registrar"
              element={<CreateColaborador />}
            />
            <Route
              path="/colaboradores/:colaboradorId/editar"
              element={<UpdateColaborador />}
            />
            <Route path="/restaurantes" element={<RestaurantesDashboard />} />
            <Route path="/puestos" element={<PuestosDashboard />} />
            <Route path="/usuarios" element={<UsuariosDashboard />} />
            <Route path="/periodos" element={<PeriodosPlanillaMenu />} />
            <Route
              path="/periodos/listado"
              element={<PeriodosPlanillaList />}
            />
            <Route path="/periodos/crear" element={<CreatePeriodoPlanilla />} />
            <Route path="/asistencia" element={<AsistenciaMenu />} />
            <Route path="/asistencia/mis-marcas" element={<MisMarcas />} />
            <Route
              element={
                <ProtectedRoute
                  roles={["GERENTE", "ADMINISTRADOR", "RECURSOS_HUMANOS"]}
                />
              }
            >
              <Route
                path="/asistencia/colaborador/:colaboradorId/marcas"
                element={<MisMarcas />}
              />
            </Route>
            <Route
              path="/asistencia/gestionar"
              element={<GestionarAsistencias />}
            />

            <Route
              path="/solicitudes-horas-extras"
              element={<SolicitudesHorasExtra />}
            />
            <Route path="/permisos-laborales" element={<PermisosLaborales />} />

            <Route
              element={
                <ProtectedRoute roles={["ADMINISTRADOR", "RECURSOS_HUMANOS"]} />
              }
            >
              <Route path="/bitacoras" element={<ConsultarBitacoras />} />
              <Route path="/bitacoras/:id" element={<DetalleBitacora />} />
            </Route>

            <Route path="/incapacidades" element={<ConsultarIncapacidades />} />
            <Route path="/incapacidades/:id" element={<DetalleIncapacidad />} />
            <Route
              path="/incapacidades/registrar"
              element={<RegistrarIncapacidad />}
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
