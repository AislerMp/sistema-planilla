import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Brand from "../components/Brand.jsx";
import LoadingState from "../components/loadingState.jsx";
import AlertMessage from "../components/AlertMessage.jsx";
import ThemeButton from "../components/ThemeButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login({ theme, onToggleTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCheckingSession, signIn } = useAuth();

  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    nombreUsuario: "",
    password: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLoading) return;

    if (!form.nombreUsuario.trim() || !form.password) {
      setError("Completá el usuario y la contraseña.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await signIn({
        nombreUsuario: form.nombreUsuario.trim(),
        password: form.password,
      });
      setForm({ nombreUsuario: "", password: "" });
      const destination = location.state?.from?.pathname ?? "/inicio";
      navigate(destination, { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

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

  if (user && !isLoading) {
    return <Navigate to="/inicio" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Planilla KFC">
        <Brand />
        <div className="story-copy">
          <p className="eyebrow">GESTIÓN DE PAGOS DE PLANILLA</p>
          <h1>
            Un equipo.
            <br />
            Un mismo
            <br />
            <span>lugar.</span>
          </h1>
          <p className="story-description">
            La información de tu personal, organizada para acompañarte en cada
            jornada.
          </p>
        </div>
        <div className="story-footer">
          <span>Personas que hacen la diferencia.</span>
          <span>01 / EQUIPO</span>
        </div>
        <div className="signature-stripes" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="login-content" aria-labelledby="login-title">
        <div className="login-top">
          <span className="preview-label">
            <span />
            Acceso al sistema
          </span>
          <ThemeButton theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <form onSubmit={handleSubmit} className="login-form page-enter">
          <p className="eyebrow accent">BIENVENIDO A TU ESPACIO</p>
          <h2 id="login-title">Iniciar sesión</h2>
          <p className="muted">Tu equipo, más cerca. Tu día, más simple.</p>
          <div className="login-fields">
            <label htmlFor="username">Nombre de usuario</label>
            <input
              id="username"
              name="nombreUsuario"
              value={form.nombreUsuario}
              onChange={handleChange}
              autoComplete="username"
            />
            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <AlertMessage title="No se pudo iniciar sesión">{error}</AlertMessage>
            <button
              className="button button-primary"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
        <p className="login-footer">
          ¿Necesitás una cuenta? Contactá al administrador.
        </p>
      </section>
    </main>
  );
}
