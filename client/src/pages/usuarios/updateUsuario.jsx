import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Save, ArrowLeft } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { getRoles } from "../../services/roles.Service.js";
import { getColaboradores } from "../../services/colaboradores.Service.js";
import { getUsers, getUserById, updateUser } from "../../services/auth.Service.js";

export default function UpdateUsuario() {
  const { user } = useAuth();
  const { usuarioId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useAsyncRequest(async () => {
    const [roles, colaboradores, usuarios, usuario] = await Promise.all([
      getRoles(), getColaboradores(), getUsers(), getUserById(usuarioId),
    ]);
    return { roles, colaboradores, usuarios, usuario };
  }, [usuarioId, reloadKey]);

  if (user?.Rol !== "ADMINISTRADOR") return <Navigate to="/usuarios" replace />;
  if (error) return <div className="data-panel catalog-message">
    <p role="alert">{error}</p>
    <button className="button button-secondary" onClick={() => setReloadKey(value => value + 1)}>Reintentar</button>
    <Link to="/usuarios" className="button button-secondary">Volver a usuarios</Link>
  </div>;
  if (!data || String(data.usuario.UsuarioId) !== usuarioId) return <p className="catalog-message" role="status">Cargando formulario...</p>;
  return <UsuarioForm key={usuarioId} data={data} />;
}

function UsuarioForm({ data }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);
  
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      nombreUsuario: data.usuario.NombreUsuario,
      rolId: String(data.usuario.RolId),
      colaboradorId: String(data.usuario.ColaboradorId ?? ""),
      
    },
  });
  const disponibles = data.colaboradores.filter(colaborador =>
    colaborador.ColaboradorId === data.usuario.ColaboradorId || 
    (colaborador.Activo && !data.usuarios.some(usuario => usuario.ColaboradorId === colaborador.ColaboradorId))
  );

  async function onSubmit(form) {
    setSubmitError(null);
    try {
      await updateUser(data.usuario.UsuarioId,{
        nombreUsuario: form.nombreUsuario.trim(),
        rolId: Number(form.rolId),
        colaboradorId: Number(form.colaboradorId),
        
      });
      // Al editar la cuenta propia, recargar recupera la identidad actualizada.
      if (data.usuario.UsuarioId === currentUserId) { window.location.assign("/usuarios"); return; }
      navigate("/usuarios", { replace: true });
    } catch (error) { setSubmitError(error.message); }
  }
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser.UsuarioId;

  return <>
    <div className="breadcrumb"><Link to="/inicio">Administración</Link> / <Link to="/usuarios">Usuarios</Link> / <span>Actualizar</span></div>
    <div className="page-header"><div>
      <p className="eyebrow accent">CUENTAS Y ACCESO</p>
      <h1>Actualizar usuario</h1>
      <p>Editá el nombre de usuario, su rol y el colaborador vinculado.</p>
    </div></div>
    <form className="catalog-form data-panel" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset disabled={isSubmitting}>
        <label>Nombre de usuario
          <input autoComplete="off" {...register("nombreUsuario", {
            required: "El nombre de usuario es obligatorio.",
            validate: value => Boolean(value.trim()) || "Ingresá un nombre de usuario.",
            maxLength: { value: 60, message: "Máximo 60 caracteres." },
          })} />
          {errors.nombreUsuario && <span className="field-error" role="alert">{errors.nombreUsuario.message}</span>}
        </label>
        <label>Rol
          <select {...register("rolId", { required: "Seleccioná un rol." })}>
            <option value="">Seleccionar rol</option>
            {data.roles.map(rol => <option key={rol.RolId} value={rol.RolId}>{rol.Nombre}</option>)}
          </select>
          {errors.rolId && <span className="field-error" role="alert">{errors.rolId.message}</span>}
        </label>
        <label>Colaborador
          <select {...register("colaboradorId", {
            required: "Seleccioná un colaborador.",
            validate: value => data.colaboradores.some(row => String(row.ColaboradorId) === value && row.Activo) || "Seleccioná un colaborador activo.",
          })}>
            <option value="">Seleccionar colaborador</option>
            {disponibles.map(row => <option key={row.ColaboradorId} value={row.ColaboradorId} disabled={!row.Activo}>
              {row.Nombres} {row.Apellidos} — {row.Identificacion}{!row.Activo ? " (inactivo)" : ""}
            </option>)}
          </select>
          {errors.colaboradorId && <span className="field-error" role="alert">{errors.colaboradorId.message}</span>}
        </label>
        <p>La contraseña se gestiona mediante el cambio de contraseña de la cuenta.</p>
        {disponibles.length === 0 && <p role="status">No hay colaboradores activos sin cuenta. Registrá o activá un colaborador primero.</p>}
        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        <div className="table-actions">
          <button className="button button-primary" type="submit" disabled={isSubmitting || !disponibles.length || !data.roles.length}><Save size={18} />{isSubmitting ? "Guardando..." : "Guardar cambios"}</button>
          <button className="button button-secondary" type="button" onClick={() => navigate("/usuarios")}><ArrowLeft size={18} />Cancelar</button>
        </div>
      </fieldset>
    </form>
  </>;
}

