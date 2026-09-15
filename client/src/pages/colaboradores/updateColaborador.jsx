import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import DireccionFields from "../../components/DireccionFields.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  getColaborador,
  updateColaborador,
} from "../../services/colaboradores.Service.js";
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

export default function UpdateColaborador() {
  const { colaboradorId } = useParams();
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
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues });

  const {
    data: colaborador,
    isLoading,
    error,
  } = useAsyncRequest(() => getColaborador(colaboradorId), [colaboradorId]);

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

  useEffect(() => {
    if (!colaborador || !restaurantes || !puestos) return;

    reset({
      identificacion: colaborador.Identificacion ?? "",
      correo: colaborador.Correo ?? "",
      nombre: colaborador.Nombres ?? "",
      apellido: colaborador.Apellidos ?? "",
      fechaIngreso: toInputDate(colaborador.FechaIngreso),
      fechaSalida: toInputDate(colaborador.FechaSalida),
      restauranteId: String(colaborador.RestauranteId ?? ""),
      puestoId: String(colaborador.PuestoId ?? ""),
    });

    setDireccion({
      distritoId: String(colaborador.DistritoId ?? ""),
      detalleDireccion: colaborador.DetalleDireccion ?? "",
    });
  }, [colaborador, restaurantes, puestos, reset]);

  async function onSubmit(form) {
    setSubmitError(null);

    try {
      await updateColaborador(colaboradorId, {
        ...form,
        restauranteId: Number(form.restauranteId),
        puestoId: Number(form.puestoId),
        fechaSalida: form.fechaSalida || null,
        distritoId: direccion.distritoId ? Number(direccion.distritoId) : null,
        detalleDireccion: direccion.detalleDireccion.trim() || null,
      });

      navigate("/colaboradores", { replace: true });
    } catch (error) {
      setSubmitError(error.message);
    }
  }

  if (user?.Rol !== "ADMINISTRADOR") {
    return <Navigate to="/colaboradores" replace />;
  }

  if (
    isLoading ||
    loadingRestaurantes ||
    loadingPuestos ||
    (!colaborador && !error)
  ) {
    return (
      <div className="loading-state" role="status">
        <span className="loading-mark" aria-hidden="true" />
        <p>Cargando colaborador...</p>
      </div>
    );
  }

  if (error) {
    return (
      <section className="data-panel catalog-message">
        <p role="alert">{error}</p>
        <Link to="/colaboradores" className="button button-secondary">
          <ArrowLeft size={18} />
          Volver a colaboradores
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="breadcrumb">
        <Link to="/inicio">Administración</Link> /{" "}
        <Link to="/colaboradores">Colaboradores</Link> / <span>Actualizar</span>
      </div>

      <div className="page-header">
        <div>
          <p className="eyebrow accent">PERSONAS Y EQUIPO</p>
          <h1>Actualizar colaborador</h1>
          <p>
            Editá la información de {colaborador.Nombres}{" "}
            {colaborador.Apellidos}.
          </p>
        </div>
      </div>

      <form
        className="catalog-form data-panel collaborator-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
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
            <p>Podés actualizarla o quitarla completamente.</p>
          </div>

          <DireccionFields
            form={direccion}
            setForm={setDireccion}
            initialDistritoId={colaborador.DistritoId}
          />

          {(restaurantesError || puestosError || submitError) && (
            <p className="form-error" role="alert">
              {submitError ?? restaurantesError ?? puestosError}
            </p>
          )}

          <div className="table-actions form-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={isSubmitting || loadingRestaurantes || loadingPuestos}
            >
              <Save size={18} />
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
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

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}
