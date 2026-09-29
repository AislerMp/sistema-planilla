import { useRef, useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Clock3, LogIn, LogOut } from "lucide-react";
import AlertMessage from "../../components/AlertMessage.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  registrarEntrada,
  registrarSalida,
} from "../../services/marcas.Service.js";
import { notifySuccess } from "../../utils/notifications.js";

const acciones = [
  {
    titulo: "Marcar entrada",
    descripcion: "Registra el inicio de tu jornada.",
    icon: LogIn,
    request: registrarEntrada,
    mensaje: "Entrada registrada correctamente.",
  },
  {
    titulo: "Marcar salida",
    descripcion: "Registra el final de tu intervalo de trabajo.",
    icon: LogOut,
    request: registrarSalida,
    mensaje: "Salida registrada correctamente.",
  },
];

export default function AsistenciaMenu() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const canMark = user?.Rol === "COLABORADOR";
  const canManage = ["GERENTE", "RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(
    user?.Rol,
  );

  async function handleAction(action) {
    if (!canMark) return;
    setBusy(true);
    setActionError("");

    try {
      const confirmation = await Swal.fire({
        icon: "question",
        titleText: `¿${action.titulo} ahora?`,
        text: "Se registrará la hora actual de tu marca.",
        showCancelButton: true,
        confirmButtonText: action.titulo,
        cancelButtonText: "Cancelar",
        reverseButtons: true,
        focusCancel: true,
        background: "var(--color-surface)",
        color: "var(--color-text)",
        confirmButtonColor: "var(--color-primary)",
      });

      if (!confirmation.isConfirmed) return;
      await action.request();
      notifySuccess(action.mensaje);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const enlaces = [
    {
      titulo: "Gestionar mis marcas",
      descripcion: "Consulta de tus marcas y horas trabajadas.",
      icon: Clock3,
      path: "/asistencia/mis-marcas",
      permitido: canMark,
      restriccion: "Disponible para colaboradores.",
    },
    {
      titulo: canMark ? "Consultar asistencias" : "Gestionar asistencias",
      descripcion: "Gestión de asistencias de los colaboradores.",
      icon: ClipboardList,
      path: "/asistencia/gestionar",
      permitido: canManage,
      restriccion:
        "Disponible para gerencia, Recursos Humanos y administración.",
    },
  ];

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Inicio</Link> / <span>Marcas y asistencias</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">JORNADA LABORAL</p>
          <h1>Marcas y asistencias</h1>
          <p>Registra tu jornada y consulta las marcas y asistencias.</p>
        </div>
      </div>
      {actionError && (
        <AlertMessage title="No se pudo registrar la marca">
          {actionError}
        </AlertMessage>
      )}
      <section
        className="module-section"
        aria-labelledby="attendance-marks-title"
        aria-busy={busy}
      >
        <div className="section-heading">
          <div>
            <h2 id="attendance-marks-title">Marcas</h2>
            <p>Registra el inicio o el final de tu jornada.</p>
          </div>
        </div>
        <div className="module-grid" aria-label="Acciones de marca">
          {acciones.map((action) => {
            const Icon = action.icon;
            return (
              <article className="module-card" key={action.titulo}>
                <div className="module-card-top">
                  <span className="module-icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                </div>
                <h3>{action.titulo}</h3>
                <p>{action.descripcion}</p>
                <div className="module-card-bottom">
                  {canMark ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy}
                      onClick={() => handleAction(action)}
                    >
                      {busy ? "Procesando..." : action.titulo}
                    </button>
                  ) : (
                    <span>Disponible para colaboradores.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="module-section"
        aria-labelledby="attendance-consult-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="attendance-consult-title">Consultas</h2>
            <p>Revisa tus marcas o consulta la asistencia del equipo.</p>
          </div>
        </div>
        <div
          className="module-grid"
          aria-label="Consultas de marcas y asistencias"
        >
          {enlaces.map((opcion) => {
            const Icon = opcion.icon;
            return (
              <article className="module-card" key={opcion.path}>
                <div className="module-card-top">
                  <span className="module-icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                </div>
                <h3>{opcion.titulo}</h3>
                <p>{opcion.descripcion}</p>
                <div className="module-card-bottom">
                  <Link className="button button-secondary" to={opcion.path}>
                    {opcion.titulo} <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
