import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Save, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { getRoles } from "../../services/roles.Service.js";
import { getColaboradores } from "../../services/colaboradores.Service.js";
import { getUsers, registerUser } from "../../services/auth.Service.js";

export default function CreateUsuario() {
  const { user } = useAuth();

  const [reloadKey, setReloadKey] = useState(0);

  const { data, error } = useAsyncRequest(async () => {
    const [roles, colaboradores, usuarios] = await Promise.all([
      getRoles(),
      getColaboradores(),
      getUsers(),
    ]);
    return { roles, colaboradores, usuarios };
  }, [reloadKey]);

  if (user?.Rol !== "ADMINISTRADOR") return <Navigate to="/usuarios" replace />;

  if (error)
    return (
      <div className="data-panel catalog-message">
        <p role="alert">{error}</p>
        <button
          className="button button-secondary"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          Reintentar
        </button>
        <Link to="/usuarios" className="button button-secondary">
          Volver a usuarios
        </Link>
      </div>
    );

  if (!data)
    return (
      <p className="catalog-message" role="status">
        Cargando formulario...
      </p>
    );

  return <UsuarioForm data={data} />;
}

function UsuarioForm({ data }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      nombreUsuario: "",
      rolId: "",
      colaboradorId: "",
      password: "",
      confirmarPassword: "",
    },
  });
  
  const disponibles = data.colaboradores.filter(
    (colaborador) =>
      colaborador.Activo &&
      !data.usuarios.some(
        (usuario) => usuario.ColaboradorId === colaborador.ColaboradorId,
      ),
  );

  async function onSubmit(form) {
    setSubmitError(null);
    try {
      await registerUser({
        nombreUsuario: form.nombreUsuario.trim(),
        rolId: Number(form.rolId),
        colaboradorId: Number(form.colaboradorId),
        password: form.password,
      });

      navigate("/usuarios", { replace: true });
    } catch (error) {
      setSubmitError(error.message);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> /{" "}
        <Link to="/usuarios">Usuarios</Link> / <span>Registrar</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">CUENTAS Y ACCESO</p>
          <h1>Registrar usuario</h1>
          <p>Creá una cuenta y asignale su rol y colaborador.</p>
        </div>
      </div>
      <form
        className="catalog-form data-panel"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <fieldset disabled={isSubmitting}>
          <label>
            Nombre de usuario
            <input
              autoComplete="off"
              {...register("nombreUsuario", {
                required: "El nombre de usuario es obligatorio.",
                validate: (value) =>
                  Boolean(value.trim()) || "Ingresá un nombre de usuario.",
                maxLength: { value: 60, message: "Máximo 60 caracteres." },
              })}
            />
            {errors.nombreUsuario && (
              <span className="field-error" role="alert">
                {errors.nombreUsuario.message}
              </span>
            )}
          </label>
          <label>
            Rol
            <select {...register("rolId", { required: "Seleccioná un rol." })}>
              <option value="">Seleccionar rol</option>
              {data.roles.map((rol) => (
                <option key={rol.RolId} value={rol.RolId}>
                  {rol.Nombre}
                </option>
              ))}
            </select>
            {errors.rolId && (
              <span className="field-error" role="alert">
                {errors.rolId.message}
              </span>
            )}
          </label>
          <label>
            Colaborador
            <select
              {...register("colaboradorId", {
                required: "Seleccioná un colaborador.",
                validate: (value) =>
                  data.colaboradores.some(
                    (row) => String(row.ColaboradorId) === value && row.Activo,
                  ) || "Seleccioná un colaborador activo.",
              })}
            >
              <option value="">Seleccionar colaborador</option>
              {disponibles.map((row) => (
                <option
                  key={row.ColaboradorId}
                  value={row.ColaboradorId}
                  disabled={!row.Activo}
                >
                  {row.Nombres} {row.Apellidos} — {row.Identificacion}
                  {!row.Activo ? " (inactivo)" : ""}
                </option>
              ))}
            </select>
            {errors.colaboradorId && (
              <span className="field-error" role="alert">
                {errors.colaboradorId.message}
              </span>
            )}
          </label>

          <label>
            Contraseña
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                {...register("password", {
                  required: "La contraseña es obligatoria.",
                })}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <span className="field-error" role="alert">
                {errors.password.message}
              </span>
            )}
          </label>
          <label>
            Confirmar contraseña
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              {...register("confirmarPassword", {
                required: "Confirmá la contraseña.",
                validate: (value) =>
                  value === getValues("password") ||
                  "Las contraseñas no coinciden.",
              })}
            />
            {errors.confirmarPassword && (
              <span className="field-error" role="alert">
                {errors.confirmarPassword.message}
              </span>
            )}
          </label>
          {disponibles.length === 0 && (
            <p role="status">
              No hay colaboradores activos sin cuenta. Registrá o activá un
              colaborador primero.
            </p>
          )}

          {submitError && (
            <p className="form-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="table-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={
                isSubmitting || !disponibles.length
              }
            >
              <Save size={18} />
              {isSubmitting ? "Guardando..." : "Registrar usuario"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => navigate("/usuarios")}
            >
              <ArrowLeft size={18} />
              Cancelar
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
