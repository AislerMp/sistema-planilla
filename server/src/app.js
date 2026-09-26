import express from "express";
import session from "express-session";
import cors from "cors";

import authRoutes from "./modules/auth/auth.routes.js";
import colaboradoresRoutes from "./modules/colaboradores/colaboradores.routes.js";
import puestosRoutes from "./modules/puestos/puestos.routes.js";
import restaurantesRoutes from "./modules/restaurantes/restaurantes.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import ubicacionesRoutes from "./modules/ubicaciones/ubicaciones.routes.js";
import periodosPlanillasRoutes from "./modules/periodoPlanilla/periodosPlanillas.routes.js";
import asistenciasDiariasRoutes from "./modules/asistenciasDiarias/asistenciasDiarias.routes.js";
import marcasRoutes from "./modules/marcas/marcas.routes.js";
import horasExtrasRoutes from "./modules/extras/horasExtras.routes.js";
import { isAuthenticate } from "./shared/middlewares/auth.middleware.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // true solo en HTTPS
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use(isAuthenticate);

app.use("/api/auth", authRoutes);
app.use("/api/colaboradores", colaboradoresRoutes);
app.use("/api/puestos", puestosRoutes);
app.use("/api/restaurantes", restaurantesRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/ubicaciones", ubicacionesRoutes);
app.use("/api/periodos-planilla", periodosPlanillasRoutes);
app.use("/api/AsistenciasDiarias", asistenciasDiariasRoutes);
app.use("/api/marcas", marcasRoutes);
app.use("/api/extras", horasExtrasRoutes);

app.use(errorHandler);

export default app;
