import { useState } from "react";
import { useForm } from "react-hook-form";import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import DireccionFields from "../../components/DireccionFields.jsx";
import LoadingState from "../../components/loadingState.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import { notifySuccess } from "../../utils/notifications.js";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { createColaborador } from "../../services/colaboradores.Service.js";
import { getRestaurantes } from "../../services/restaurantes.Service.js";
import { getPuestos } from "../../services/puestos.Service.js";

const defaultValues = {
  identificacion: "",
  correo: "",
  nombre: "",
  apellido: "",
  fechaIngreso: "",
  fechaSalida: "",
  restauranteId: "",
  puestoId: "",
};

export default function CreateColaborador() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [direccion, setDireccion] = useState({
    distritoId: "",
    detalleDireccion: "",
  });
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues });

  const {
    data: restaurantes,
    isLoading: loadingRestaurantes,
    error: restaurantesError,
  } = useAsyncRequest(getRestaurantes);

  const {
    data: puestos,
    isLoading: loadingPuestos,
    error: puestosError,
  } = useAsyncRequest(getPuestos);

  async function onSubmit(form) {
    setSubmitError(null);

    try {
      await createColaborador({
        ...form,
        restauranteId: Number(form.restauranteId),
        puestoId: Number(form.puestoId),
        fechaSalida: form.fechaSalida || null,
        distritoId: direccion.distritoId
          ? Number(direccion.distritoId)
          : null,
        detalleDireccion: direccion.detalleDireccion.trim() || null,
      });

      notifySuccess("Colaborador registrado correctamente.");
      navigate("/colaboradores", { replace: true });
    } catch (error) {
      setSubmitError(error.message);
    }
  }

  if (user?.Rol !== "ADMINISTRADOR") {
    return <Navigate to="/colaboradores" replace />;
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> /{" "}
        <Link to="/colaboradores">Colaboradores</Link> /{" "}
        <span>Registrar</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">PERSONAS Y EQUIPO</p>
          <h1>Registrar colaborador</h1>
          <p>Completá los datos personales, laborales y de dirección.</p>
        </div>
      </div>

      <form
        className="catalog-form data-panel collaborator-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {(loadingRestaurantes || loadingPuestos) && (
          <LoadingState entidad="restaurantes y puestos" compacto descripcion="" />
        )}
        <fieldset disabled={isSubmitting}>
          <label>
            Identificación
            <input
              {...register("identificacion", {
                required: "La identificación es obligatoria.",
                maxLength: { value: 30, message: "Máximo 30 caracteres." },
              })}
            />
            <FieldError error={errors.identificacion} />
          </label>

          <label>
            Nombres
            <input
              {...register("nombre", {
                required: "El nombre es obligatorio.",
                maxLength: { value: 100, message: "Máximo 100 caracteres." },
              })}
            />
            <FieldError error={errors.nombre} />
          </label>

          <label>
            Apellidos
            <input
              {...register("apellido", {
                required: "El apellido es obligatorio.",
                maxLength: { value: 100, message: "Máximo 100 caracteres." },
              })}
            />
            <FieldError error={errors.apellido} />
          </label>

          <label>
            Correo electrónico
            <input
              type="email"
              {...register("correo", {
                required: "El correo es obligatorio.",
                maxLength: { value: 100, message: "Máximo 100 caracteres." },
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Ingresá un correo válido.",
                },
              })}
            />
            <FieldError error={errors.correo} />
          </label>

          <label>
            Fecha de ingreso
            <input
              type="date"
              {...register("fechaIngreso", {
                required: "La fecha de ingreso es obligatoria.",
              })}
            />
            <FieldError error={errors.fechaIngreso} />
          </label>

          <label>
            Fecha de salida
            <input
              type="date"
              {...register("fechaSalida", {
                validate: (value) =>
                  !value ||
                  !getValues("fechaIngreso") ||
                  value >= getValues("fechaIngreso") ||
                  "La fecha de salida no puede ser anterior al ingreso.",
              })}
            />
            <FieldError error={errors.fechaSalida} />
          </label>

          <label>
            Restaurante
            <select
              disabled={loadingRestaurantes}
              {...register("restauranteId", {
                required: "Seleccioná un restaurante.",
              })}
            >
              <option value="">Seleccionar restaurante</option>
              {(restaurantes ?? []).map((restaurante) => (
                <option
                  key={restaurante.RestauranteId}
                  value={restaurante.RestauranteId}
                >
                  {restaurante.Nombre}
                </option>
              ))}
            </select>
            <FieldError error={errors.restauranteId} />
          </label>

          <label>
            Puesto
            <select
              disabled={loadingPuestos}
              {...register("puestoId", {
                required: "Seleccioná un puesto.",
              })}
            >
              <option value="">Seleccionar puesto</option>
              {(puestos ?? []).map((puesto) => (
                <option key={puesto.PuestoId} value={puesto.PuestoId}>
                  {puesto.Nombre}
                </option>
              ))}
            </select>
            <FieldError error={errors.puestoId} />
          </label>

          <div className="form-section-title">
            <h2>Dirección</h2>
            <p>Es opcional, pero distrito y detalle deben enviarse juntos.</p>
          </div>

          <DireccionFields form={direccion} setForm={setDireccion} />

          {(restaurantesError || puestosError || submitError) && (
            <AlertMessage>
              {submitError ?? restaurantesError ?? puestosError}
            </AlertMessage>
          )}

          <div className="table-actions form-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={
                isSubmitting || loadingRestaurantes || loadingPuestos
              }
            >
              <Save size={18} />
              {isSubmitting ? "Guardando..." : "Guardar colaborador"}
            </button>

            <Link to="/colaboradores" className="button button-secondary">
              <ArrowLeft size={18} />
              Cancelar
            </Link>
          </div>
        </fieldset>
      </form>
    </>
  );
}

function FieldError({ error }) {
  if (!error) return null;
  return <span className="field-error">{error.message}</span>;
}
