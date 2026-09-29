import { Link } from "react-router-dom";
import LoadingState from "../components/loadingState.jsx";
import AlertMessage from "../components/AlertMessage.jsx";
import { menuItems } from "../utils/menuItems.js";
import { ArrowRight, ArrowUpRight, Clock3, ClipboardList } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

import useAsyncRequest from "../hooks/useAsyncRequest.js";
import { getColaboradores } from "../services/colaboradores.Service.js";
import { getRestaurantes } from "../services/restaurantes.Service.js";
import { getPuestos } from "../services/puestos.Service.js";
import { getUsers } from "../services/auth.Service.js";
import { getPeriodos } from "../services/periodos.Service.js";

async function loadCounts(role) {
  if (!role) return {};
  const loaders = {
    "/colaboradores": getColaboradores,
    "/restaurantes": () => getRestaurantes("todos"),
    "/puestos": () => getPuestos("todos"),
    "/usuarios": getUsers,
    "/periodos": getPeriodos,
  };
  const items = menuItems.filter((item) =>
    !item.nonPermision.includes(role) && item.showCount !== false && loaders[item.path],
  );
  const results = await Promise.allSettled(items.map(async (item) => {
    const rows = await loaders[item.path]();
    return rows.filter((row) => item.path === "/periodos" ? row.Estado !== "PAGADO" : row.Activo).length;
  }));
  return Object.fromEntries(items.map((item, index) => [
    item.path, results[index].status === "fulfilled" ? results[index].value : null,
  ]));
}

const collaboratorCards = [
  {
    title: "Registrar mi jornada",
    path: "/asistencia",
    icon: Clock3,
    description: "Marcá tu entrada o salida para registrar tu jornada de trabajo.",
    showCount: false,
  },
  {
    title: "Consultar mis marcas",
    path: "/asistencia/mis-marcas",
    icon: ClipboardList,
    description: "Revisá tus entradas y salidas y buscá registros por fecha.",
    showCount: false,
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const { data: counts, isLoading } = useAsyncRequest(
    () => loadCounts(user?.Rol),
    [user?.Rol],
  );
  const displayName = user?.NombreUsuario ?? "Usuario";
  const isCollaborator = user?.Rol === "COLABORADOR";
  const sectionLabel = isCollaborator ? "MI JORNADA" : user?.Rol === "GERENTE" ? "MI RESTAURANTE" : "ADMINISTRACIÓN";
  const cards = isCollaborator ? collaboratorCards : menuItems.filter((item) => !item.nonPermision.includes(user?.Rol));
  const hasCounters = cards.some((card) => card.showCount !== false);
  const hasCountErrors = !isLoading && cards.some((card) => card.showCount !== false && counts?.[card.path] === null);

  return (
    <>
      <div className="breadcrumb">
        Tu espacio / <span>Inicio</span>
      </div>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <p className="eyebrow accent">TU ESPACIO DE TRABAJO</p>
          <h1>
            Bienvenido, {displayName}
            <span className="accent">.</span>
          </h1>
          <p>
            {isCollaborator ? (
              <>Este es tu espacio para registrar tu jornada y consultar tus marcas.</>
            ) : (
              <>
            Un equipo conectado empieza con todo en su lugar.
            <br className="desktop-break" /> Explorá la información de tu
            personal y tus restaurantes.
              </>
            )}
          </p>
          <Link to={isCollaborator ? "/asistencia" : "/colaboradores"} className="button button-primary">
            {isCollaborator ? "Registrar mi jornada" : "Ver colaboradores"} <ArrowRight size={18} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-logo">
            <img src="/images/kfc-logo.png" alt="" width="100" height="100" />
          </div>
          <div className="welcome-stripes">
            <i />
            <i />
            <i />
          </div>
          <span>SIEMPRE EN EQUIPO.</span>
        </div>
      </section>
      <section className="module-section" aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <h2 id="modules-title">{isCollaborator ? "Tu jornada, en un solo lugar" : "Todo empieza aquí"}</h2>
            <p>{isCollaborator ? "Accedé a tus marcas y a tu historial de trabajo." : "Elegí el módulo con el que querés trabajar."}</p>
          </div>
          <span className="subtle-tag">{sectionLabel}</span>
        </div>
        <div className="module-grid">
          {cards.map((card) => {
            const Icon = card.icon;
              return (
                <Link to={card.path} className="module-card" key={card.path}>
                  <div className="module-card-top">
                    <span className="module-icon">
                      <Icon size={23} />
                    </span>
                    <ArrowUpRight className="card-arrow" size={20} />
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                  <div className="module-card-bottom">
                    {card.showCount === false ? (
                      <span>Abrir módulo</span>
                    ) : (
                      <>
                        <strong>
                          {isLoading || !counts ? "…" : (counts[card.path] ?? "—")}
                        </strong>
                        <span>{card.label}</span>
                      </>
                    )}
                  </div>
                </Link>
              );
          })}
        </div>
        {hasCounters && (isLoading || !counts) && (
          <LoadingState entidad="resumen" compacto descripcion="" />
        )}
        {hasCountErrors && (
          <AlertMessage type="warning" title="El resumen está incompleto">
            No se pudieron cargar todas las cantidades. Ingresá al módulo para
            reintentar la consulta.
          </AlertMessage>
        )}
      </section>
    </>
  );
}
