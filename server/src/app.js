import express from "express";
import session from "express-session";
import cors from "cors";

import routes from "./routes/index.js";
import authRoutes from "./routes/auth.routes.js";
import colaboradoresRoutes from "./routes/colaboradores.routes.js";
import puestosRoutes from "./routes/puestos.routes.js";
import restaurantesRoutes from "./routes/restaurantes.routes.js";
import rolesRoutes from "./routes/roles.routes.js";
import ubicacionesRoutes from "./routes/ubicaciones.routes.js";
import { isAuthenticate } from "./middlewares/auth.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

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

app.use("/api", routes);
app.use("/api/auth", authRoutes);
app.use("/api/colaboradores", colaboradoresRoutes);
app.use("/api/puestos", puestosRoutes);
app.use("/api/restaurantes", restaurantesRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/ubicaciones", ubicacionesRoutes);

app.use(errorHandler);

export default app;
