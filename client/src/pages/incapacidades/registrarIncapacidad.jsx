import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Send,
  Upload,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import { getColaborador } from "../../services/colaboradores.Service.js";
import { getRestaurante } from "../../services/restaurantes.Service.js";
import {
  getTiposIncapacidades,
  solicitarIncapacidad,
} from "../../services/incapacidades.Services.js";
import { useAuth } from "../../context/AuthContext.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";

export default function RegistrarIncapacidad() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      tipoIncapacidadId: "",
      numeroDocumento: "",
      fechaInicio: "",
      fechaFin: "",
      motivo: "",
    },
  });

  const {
    data: colaborador,
    error,
    isLoading,
  } = useAsyncRequest(
    () =>
      user?.ColaboradorId
        ? getColaborador(user.ColaboradorId)
        : Promise.resolve(null),
    [user?.ColaboradorId],
  );

  const {
    data: restaurante,
    error: errorRest,
    isLoading: isLoadingRest,
  } = useAsyncRequest(
    () =>
      colaborador?.RestauranteId
        ? getRestaurante(colaborador.RestauranteId)
        : Promise.resolve(null),
    [colaborador?.RestauranteId],
  );

  const {
    data: tiposIncapacidades,
    isLoading: isLoadingTipos,
    error: errorTipos,
  } = useAsyncRequest(getTiposIncapacidades, []);

  const errorCarga = error || errorRest || errorTipos;
  const tipos = tiposIncapacidades ?? [];

  async function onSubmit(datos) {
    clearErrors("root");
    try {
      await solicitarIncapacidad({
        restauranteId: colaborador.RestauranteId,
        tipoIncapacidadId: datos.tipoIncapacidadId,
        numeroDocumento: datos.numeroDocumento.trim(),
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        motivo: datos.motivo.trim(),
        comprobante: datos.comprobante[0],
      });
      navigate("/incapacidades");
    } catch (error) {
      setError("root", {
        message: error.message || "No se pudo enviar la solicitud de incapacidad.",
      });
    }
  }

  return (
    <div className="incapacidad-detail">
      <div className="breadcrumb">
        <Link to="/inicio"> Gestión de planilla</Link> /{" "}
        <Link to="/incapacidades"> Incapacidades</Link> / <span>Registrar</span>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">NUEVA SOLICITUD</p>
          <h1>Registrar incapacidad</h1>
          <p>
            Completá los datos y adjuntá el comprobante para la revisión de
            gerencia.
          </p>
        </div>
        <Link className="button button-secondary" to="/incapacidades">
          <ArrowLeft size={16} aria-hidden="true" /> Volver al listado
        </Link>
      </div>

      {isLoading || isLoadingRest || isLoadingTipos ? (
        <LoadingState entidad="datos de la solicitud" />
      ) : errorCarga ? (
        <AlertMessage title="No se pudieron cargar los datos de la solicitud">
          {errorCarga}
        </AlertMessage>
      ) : !colaborador || !restaurante ? (
        <AlertMessage>
          No se encontraron los datos del solicitante.
        </AlertMessage>
      ) : (
        <>
          <section
            className="data-panel catalog-form incapacidad-resumen"
            aria-label="Datos del solicitante"
          >
            <div className="incapacidad-resumen-heading">
              <div>
                <p className="eyebrow accent">SOLICITANTE</p>
                <h2>Datos del colaborador</h2>
              </div>
            </div>
            <dl className="solicitud-details">
              <div>
                <dt>Colaborador</dt>
                <dd>{`${colaborador.Nombres} ${colaborador.Apellidos}`}</dd>
              </div>
              <div>
                <dt>{restaurante.Nombre}</dt>
                <dd>{restaurante.DetalleDireccion}</dd>
              </div>
            </dl>
          </section>

          <form
            className="solicitud-detail-columns incapacidad-contenido"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <section
              className="data-panel catalog-form solicitud-create-form"
              aria-labelledby="incapacidad-registro-titulo"
            >
              <h2 id="incapacidad-registro-titulo">
                <ClipboardCheck size={20} aria-hidden="true" /> Datos de la
                incapacidad
              </h2>
              <p>
                Usá la información y las fechas que aparecen en el comprobante.
              </p>
              <fieldset
                aria-label="Datos de la incapacidad"
                disabled={isSubmitting}
              >
                <label htmlFor="incapacidad-tipo">
                  Tipo de incapacidad
                  <select
                    id="incapacidad-tipo"
                    {...register("tipoIncapacidadId", {
                      required: "Seleccioná un tipo de incapacidad.",
                    })}
                    disabled={tipos.length === 0}
                    aria-invalid={!!errors.tipoIncapacidadId}
                    aria-describedby={
                      errors.tipoIncapacidadId
                        ? "incapacidad-tipo-error"
                        : undefined
                    }
                  >
                    <option value="" disabled>
                      {tipos.length === 0
                        ? "No hay tipos de incapacidad disponibles"
                        : "Seleccioná un tipo de incapacidad"}
                    </option>
                    {tipos.map((tipo) => (
                      <option
                        key={tipo.TipoIncapacidadId}
                        value={tipo.TipoIncapacidadId}
                      >
                        {tipo.Nombre} · {tipo.EntidadEmisora}
                      </option>
                    ))}
                  </select>
                  {errors.tipoIncapacidadId && (
                    <span
                      id="incapacidad-tipo-error"
                      className="field-error"
                      role="alert"
                    >
                      {errors.tipoIncapacidadId.message}
                    </span>
                  )}
                </label>
                <label htmlFor="incapacidad-documento">
                  Número de documento
                  <input
                    id="incapacidad-documento"
                    {...register("numeroDocumento", {
                      required: "Indicá el número de documento.",
                      validate: (value) =>
                        !!value.trim() || "Indicá el número de documento.",
                      maxLength: {
                        value: 50,
                        message: "Máximo 50 caracteres.",
                      },
                    })}
                    type="text"
                    placeholder="Ej. CCSS-2026-1024"
                    aria-invalid={!!errors.numeroDocumento}
                    aria-describedby={
                      errors.numeroDocumento
                        ? "incapacidad-documento-error"
                        : undefined
                    }
                  />
                  {errors.numeroDocumento && (
                    <span
                      id="incapacidad-documento-error"
                      className="field-error"
                      role="alert"
                    >
                      {errors.numeroDocumento.message}
                    </span>
                  )}
                </label>
                <label htmlFor="incapacidad-inicio">
                  Fecha de inicio
                  <input
                    id="incapacidad-inicio"
                    type="date"
                    {...register("fechaInicio", {
                      required: "Indicá la fecha de inicio.",
                      deps: ["fechaFin"],
                    })}
                    aria-invalid={!!errors.fechaInicio}
                    aria-describedby={
                      errors.fechaInicio
                        ? "incapacidad-inicio-error"
                        : undefined
                    }
                  />
                  {errors.fechaInicio && (
                    <span
                      id="incapacidad-inicio-error"
                      className="field-error"
                      role="alert"
                    >
                      {errors.fechaInicio.message}
                    </span>
                  )}
                </label>
                <label htmlFor="incapacidad-fin">
                  Fecha de fin
                  <input
                    id="incapacidad-fin"
                    type="date"
                    {...register("fechaFin", {
                      required: "Indicá la fecha de fin.",
                      validate: (value) =>
                        !getValues("fechaInicio") ||
                        value >= getValues("fechaInicio") ||
                        "La fecha de fin no puede ser anterior al inicio.",
                    })}
                    aria-invalid={!!errors.fechaFin}
                    aria-describedby={
                      errors.fechaFin ? "incapacidad-fin-error" : undefined
                    }
                  />
                  {errors.fechaFin && (
                    <span
                      id="incapacidad-fin-error"
                      className="field-error"
                      role="alert"
                    >
                      {errors.fechaFin.message}
                    </span>
                  )}
                </label>
                <p className="solicitud-create-note">
                  Indicá el período completo, incluyendo el primer y el último
                  día de incapacidad.
                </p>
                <label
                  className="solicitud-details-wide solicitud-resolution"
                  htmlFor="incapacidad-motivo"
                >
                  Motivo (opcional)
                  <textarea
                    id="incapacidad-motivo"
                    {...register("motivo", {
                      maxLength: {
                        value: 500,
                        message: "Máximo 500 caracteres.",
                      },
                    })}
                    rows={4}
                    placeholder="Agregá información que ayude a revisar tu solicitud"
                    aria-invalid={!!errors.motivo}
                    aria-describedby={
                      errors.motivo ? "incapacidad-motivo-error" : undefined
                    }
                  />
                  {errors.motivo && (
                    <span
                      id="incapacidad-motivo-error"
                      className="field-error"
                      role="alert"
                    >
                      {errors.motivo.message}
                    </span>
                  )}
                </label>
              </fieldset>
            </section>

            <div className="solicitud-summary incapacidad-lateral">
              <section
                className="data-panel catalog-form solicitud-create-form"
                aria-labelledby="incapacidad-comprobante-titulo"
              >
                <h2 id="incapacidad-comprobante-titulo">
                  <FileText size={20} aria-hidden="true" /> Comprobante
                </h2>
                <div className="incapacidad-comprobante">
                  <Upload size={28} aria-hidden="true" />
                  <div>
                    <strong>Adjuntá un documento legible</strong>
                    <p className="solicitud-create-note">
                      Asegurate de que se vean el número de documento y las
                      fechas.
                    </p>
                  </div>
                </div>
                <fieldset
                  aria-label="Archivo del comprobante"
                  disabled={isSubmitting}
                >
                  <label
                    className="solicitud-details-wide"
                    htmlFor="incapacidad-comprobante"
                  >
                    Seleccionar comprobante
                    <input
                      id="incapacidad-comprobante"
                      {...register("comprobante", {
                        validate: {
                          requerido: (files) =>
                            !!files?.[0] || "Adjuntá el comprobante.",
                          tamano: (files) =>
                            !files?.[0] ||
                            files[0].size <= 5 * 1024 * 1024 ||
                            "El comprobante no puede superar 5 MB.",
                          formato: (files) =>
                            !files?.[0] ||
                            /\.(pdf|jpe?g|png)$/i.test(files[0].name) ||
                            "Seleccioná un archivo PDF, JPG o PNG.",
                        },
                      })}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      aria-invalid={!!errors.comprobante}
                      aria-describedby={`incapacidad-archivo-ayuda${errors.comprobante ? " incapacidad-comprobante-error" : ""}`}
                    />
                    {errors.comprobante && (
                      <span
                        id="incapacidad-comprobante-error"
                        className="field-error"
                        role="alert"
                      >
                        {errors.comprobante.message}
                      </span>
                    )}
                  </label>
                  <p
                    id="incapacidad-archivo-ayuda"
                    className="solicitud-create-note"
                  >
                    Un archivo PDF, JPG o PNG · Máximo 5 MB.
                  </p>
                </fieldset>
              </section>

              <section
                className="data-panel catalog-form solicitud-create-form"
                aria-labelledby="incapacidad-envio-titulo"
              >
                <h2 id="incapacidad-envio-titulo">
                  <Send size={20} aria-hidden="true" /> Antes de enviar
                </h2>
                <p>
                  Revisá las fechas y el archivo adjunto. Tu gerente revisará la
                  solicitud antes de enviarla a Recursos Humanos.
                </p>
                <AlertMessage type="info" title="Marcas durante la incapacidad">
                  Las fechas cubiertas bloquearán las marcas mientras la
                  solicitud esté pendiente, en revisión de RH o aprobada.
                </AlertMessage>
                {errors.root && (
                  <AlertMessage title="No se pudo enviar la solicitud">
                    {errors.root.message}
                  </AlertMessage>
                )}
                <div className="solicitud-create-actions">
                  <Link className="button button-secondary" to="/incapacidades">
                    Cancelar
                  </Link>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={isSubmitting || tipos.length === 0}
                  >
                    {isSubmitting ? "Enviando…" : "Enviar a gerencia"}
                  </button>
                </div>
              </section>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
