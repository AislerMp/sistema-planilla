import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  HeartPulse,
  ReceiptText,
  X,
} from "lucide-react";
import { getNotificaciones } from "../../services/notificaciones.Service.js";
import LoadingState from "../loadingState.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const tiposSolicitud = {
  VACACIONES: {
    nombre: "Vacaciones",
    icono: CalendarDays,
    ruta: "/vacaciones",
    detalle: true,
  },
  INCAPACIDAD: {
    nombre: "Incapacidad",
    icono: HeartPulse,
    ruta: "/incapacidades",
    detalle: true,
  },
  DEDUCCION: {
    nombre: "Deducción",
    icono: ReceiptText,
    ruta: "/solicitudes-deducciones",
    detalle: true,
  },
  PERMISO_LABORAL: {
    nombre: "Permiso laboral",
    icono: ClipboardCheck,
    ruta: "/permisos-laborales",
  },
  HORAS_EXTRAS: {
    nombre: "Horas extra",
    icono: Clock3,
    ruta: "/solicitudes-horas-extras",
  },
};
const estados = {
  PENDIENTE: "Pendiente",
  EN_REVISION_RH: "En revisión de RH",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};
const formatoHora = new Intl.DateTimeFormat("es-CR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Costa_Rica",
});

export default function CampanaNotificaciones() {
  const { user } = useAuth();
  const claveLectura = `notificaciones-leidas:${user.UsuarioId}`;
  const [leidas, setLeidas] = useState(() => {
    try {
      const guardadas = JSON.parse(window.localStorage.getItem(claveLectura) ?? "[]");
      return Array.isArray(guardadas) ? guardadas : [];
    } catch {
      return [];
    }
  });
  const [notificaciones, setNotificaciones] = useState([]);
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const menuRef = useRef(null);
  const botonRef = useRef(null);
  const sinLeer = notificaciones.filter((aviso) => !leidas.includes(aviso.NotificacionId)).length;

  useEffect(() => {
    const controller = new AbortController();
    let consultando = false;

    async function consultar() {
      if (consultando || controller.signal.aborted) return;
      consultando = true;

      try {
        const avisos = await getNotificaciones(controller.signal);

        if (!controller.signal.aborted) {
          setNotificaciones([...avisos].reverse());
          setError(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudieron actualizar las notificaciones.");
        }
      } finally {
        consultando = false;
        if (!controller.signal.aborted) setCargando(false);
      }
    }

    consultar();
    const intervalo = window.setInterval(consultar, 60_0);

    return () => {
      window.clearInterval(intervalo);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!abierta) return;

    function cerrarFuera(event) {
      if (!menuRef.current?.contains(event.target)) setAbierta(false);
    }
    function cerrarConEscape(event) {
      if (event.key === "Escape") cerrar();
    }

    document.addEventListener("pointerdown", cerrarFuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, [abierta]);

  function cerrar() {
    setAbierta(false);
    botonRef.current?.focus();
  }

  function marcarLeida(notificacionId) {
    if (!leidas.includes(notificacionId)) {
      const actualizadas = [...leidas, notificacionId];
      setLeidas(actualizadas);
      try {
        window.localStorage.setItem(claveLectura, JSON.stringify(actualizadas));
      } catch {
        // La lectura se mantiene en esta sesión si el navegador bloquea el almacenamiento.
      }
    }
    setAbierta(false);
  }

  return (
    <div className="notificaciones-menu" ref={menuRef}>
      <button
        type="button"
        className="icon-button notificaciones-boton"
        ref={botonRef}
        aria-label={`Notificaciones: ${sinLeer} avisos sin leer`}
        aria-expanded={abierta}
        aria-controls={abierta ? "panel-notificaciones" : undefined}
        onClick={() => setAbierta((actual) => !actual)}
      >
        <Bell size={20} aria-hidden="true" />
        {sinLeer > 0 && (
          <span className="notificaciones-contador" aria-hidden="true">
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <section
          className="notificaciones-panel"
          id="panel-notificaciones"
          aria-labelledby="notificaciones-titulo"
        >
          <div className="notificaciones-encabezado">
            <div>
              <h2 id="notificaciones-titulo">Notificaciones</h2>
              <p>Actividad reciente de tus solicitudes</p>
            </div>
            <button
              type="button"
              className="notificaciones-cerrar"
              onClick={cerrar}
              aria-label="Cerrar notificaciones"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          {error && (
            <p className="notificaciones-error" role="status">
              <CircleAlert size={16} aria-hidden="true" />
              {error}
            </p>
          )}
          {cargando && (
            <LoadingState
              mensaje="Cargando avisos..."
              descripcion=""
              compacto
            />
          )}
          {!cargando && !error && notificaciones.length === 0 && (
            <div className="notificaciones-vacio" role="status">
              <BellOff size={28} strokeWidth={1.5} aria-hidden="true" />
              <strong>Sin avisos recientes</strong>
              <p>Las novedades de tus solicitudes aparecerán aquí.</p>
            </div>
          )}

          {notificaciones.length > 0 && (
            <ul className="notificaciones-lista">
              {notificaciones.map((aviso) => {
                const leida = leidas.includes(aviso.NotificacionId);
                const tipo = tiposSolicitud[aviso.TipoSolicitud] ?? {
                  nombre: "Solicitud",
                  icono: Bell,
                  ruta: "/inicio",
                };
                const Icono = tipo.icono;
                const tieneDetalle = tipo.detalle && Boolean(aviso.SolicitudId);
                const destino = tieneDetalle
                  ? `${tipo.ruta}/${encodeURIComponent(aviso.SolicitudId)}`
                  : tipo.ruta;

                return (
                  <li key={aviso.NotificacionId}>
                    <Link
                      className={`notificacion-enlace ${leida ? "notificacion-enlace--leida" : "notificacion-enlace--sin-leer"}`}
                      to={destino}
                      onClick={() => marcarLeida(aviso.NotificacionId)}
                    >
                      <span className="notificacion-icono">
                        <Icono size={18} strokeWidth={1.7} aria-hidden="true" />
                      </span>
                      <div className="notificacion-contenido">
                        <div className="notificacion-asunto">
                          <strong>{tipo.nombre}</strong>
                          <div className="notificacion-meta">
                            {leida && (
                              <span className="notificacion-lectura">
                                <Check size={12} aria-hidden="true" />Leída
                              </span>
                            )}
                            {aviso.NotificacionFechaCreacion && (
                              <time dateTime={aviso.NotificacionFechaCreacion}>
                                {formatoHora.format(
                                  new Date(aviso.NotificacionFechaCreacion),
                                )}
                              </time>
                            )}
                          </div>
                        </div>
                        <p>
                          {aviso.SolicitudId
                            ? `Solicitud #${aviso.SolicitudId}`
                            : "Actividad de solicitudes"}
                        </p>
                        <div className="notificacion-pie">
                          <span
                            className={`notificacion-estado notificacion-estado--${aviso.Estado?.toLowerCase()}`}
                          >
                            {estados[aviso.Estado] ?? "Actualizada"}
                          </span>
                          <span className="notificacion-destino">
                            {tieneDetalle ? "Ver detalle" : "Ir al apartado"}
                            <ChevronRight size={14} aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
