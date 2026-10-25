import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarDays, ReceiptText } from "lucide-react";
import { crearDeduccion, getDeducciones } from "../../../services/deducciones.Service.js";
import { notifySuccess } from "../../../utils/notifications.js";
import AlertMessage from "../../../components/AlertMessage.jsx";

function normalizarTexto(valor) {
  return valor.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-CR");
}

export default function CrearDeduccion() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState("ADICIONAL");
  const [fechaInicio, setFechaInicio] = useState("");
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      nombre: "",
      codigo: "",
      tipoDeduccion: "ADICIONAL",
      entidadReceptora: "",
      fechaVigenciaInicio: "",
      fechaVigenciaFin: "",
      porcentaje: "",
    },
  });

  function quitarNumeros(event, campo) {
    clearErrors(campo);
    const limpio = event.target.value.replace(/[0-9]/g, "");
    if (limpio !== event.target.value) {
      event.target.value = limpio;
      setValue(campo, limpio);
    }
  }

  const porcentajeRegistrado = register("porcentaje", {
    validate: (valor) =>
      getValues("tipoDeduccion") !== "LEGAL" ||
      (/^\d{1,3}(?:\.\d{1,2})?$/.test(valor) &&
        Number(valor) > 0 &&
        Number(valor) <= 100) ||
      "Ingresá un porcentaje mayor que 0 y hasta 100, con máximo dos decimales.",
  });

  async function onSubmit(datos) {
    clearErrors("root");
    try {
      const catalogo = await getDeducciones();
      const nombreRepetido = catalogo.some(
        (deduccion) =>
          normalizarTexto(deduccion.Nombre) === normalizarTexto(datos.nombre),
      );
      const codigoRepetido = catalogo.some(
        (deduccion) =>
          normalizarTexto(deduccion.Codigo) === normalizarTexto(datos.codigo),
      );

      if (nombreRepetido) {
        setError("nombre", { message: "Ya existe una deducción con ese nombre." });
      }
      if (codigoRepetido) {
        setError("codigo", { message: "Ya existe una deducción con ese código." });
      }
      if (nombreRepetido || codigoRepetido) return;

      await crearDeduccion({
        ...datos,
        nombre: datos.nombre.trim(),
        codigo: datos.codigo.trim(),
        entidadReceptora: datos.entidadReceptora.trim() || null,
        fechaVigenciaFin: datos.fechaVigenciaFin || null,
        porcentaje: datos.tipoDeduccion === "LEGAL" ? Number(datos.porcentaje) : null,
      });
      notifySuccess("Concepto creado correctamente.");
      navigate("/deducciones");
    } catch (error) {
      setError("root", {
        message: error.message || "No se pudo crear la deducción.",
      });
    }
  }

  return (
    <div className="deducciones-page">
      <div className="breadcrumb">
        <Link to="/inicio">Gestión de planilla</Link> /{" "}
        <Link to="/deducciones">Deducciones</Link> / <span>Nuevo concepto</span>
      </div>

      <Link className="deducciones-volver" to="/deducciones">
        <ArrowLeft size={16} aria-hidden="true" /> Volver al catálogo
      </Link>

      <div className="page-header deducciones-page-heading">
        <div>
          <p className="eyebrow accent">CATÁLOGO DE DEDUCCIONES</p>
          <h1>Nuevo concepto</h1>
          <p>Definí los datos y la vigencia del concepto.</p>
        </div>
      </div>

      <form
        className="catalog-form data-panel deducciones-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        {errors.root && (
          <AlertMessage title="No se pudo crear el concepto">
            {errors.root.message}
          </AlertMessage>
        )}

        <fieldset className="deducciones-create-fieldset" disabled={isSubmitting}>
          <section className="deducciones-form-section" aria-labelledby="datos-concepto-titulo">
            <div className="deducciones-section-heading">
              <div className="deducciones-section-icon">
                <ReceiptText size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 id="datos-concepto-titulo">Datos del concepto</h2>
                <p>Identificá el concepto dentro del catálogo.</p>
              </div>
            </div>
            <div className="deducciones-form-grid">
              <label htmlFor="deduccion-nombre">
                Nombre
                <input
                  id="deduccion-nombre"
                  type="text"
                  maxLength={100}
                  {...register("nombre", {
                    required: "El nombre es obligatorio.",
                    validate: (valor) => !!valor.trim() || "El nombre es obligatorio.",
                    onChange: (event) => quitarNumeros(event, "nombre"),
                  })}
                  aria-invalid={!!errors.nombre}
                  aria-describedby={errors.nombre ? "deduccion-nombre-error" : undefined}
                />
                {errors.nombre && (
                  <span id="deduccion-nombre-error" className="field-error" role="alert">
                    {errors.nombre.message}
                  </span>
                )}
              </label>

              <label htmlFor="deduccion-codigo">
                Código
                <input
                  id="deduccion-codigo"
                  type="text"
                  maxLength={50}
                  {...register("codigo", {
                    required: "El código es obligatorio.",
                    validate: (valor) => !!valor.trim() || "El código es obligatorio.",
                    onChange: (event) => quitarNumeros(event, "codigo"),
                  })}
                  aria-invalid={!!errors.codigo}
                  aria-describedby={errors.codigo ? "deduccion-codigo-error" : undefined}
                />
                {errors.codigo && (
                  <span id="deduccion-codigo-error" className="field-error" role="alert">
                    {errors.codigo.message}
                  </span>
                )}
              </label>

              <label htmlFor="deduccion-tipo-crear">
                Tipo
                <select
                  id="deduccion-tipo-crear"
                  {...register("tipoDeduccion", {
                    onChange: (event) => {
                      setTipo(event.target.value);
                      setValue("porcentaje", "");
                      clearErrors("porcentaje");
                    },
                  })}
                >
                  <option value="ADICIONAL">Adicional</option>
                  <option value="LEGAL">Legal</option>
                </select>
              </label>

              <label htmlFor="deduccion-entidad">
                Entidad receptora (opcional)
                <input
                  id="deduccion-entidad"
                  type="text"
                  maxLength={100}
                  {...register("entidadReceptora", {
                    onChange: (event) => quitarNumeros(event, "entidadReceptora"),
                  })}
                />
              </label>
            </div>
          </section>

          <section className="deducciones-form-section" aria-labelledby="vigencia-concepto-titulo">
            <div className="deducciones-section-heading">
              <div className="deducciones-section-icon">
                <CalendarDays size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 id="vigencia-concepto-titulo">Vigencia y porcentaje</h2>
                <p>Indicá desde cuándo aplica esta versión.</p>
              </div>
            </div>
            <div className="deducciones-form-grid">
              <label htmlFor="deduccion-inicio">
                Inicio de vigencia
                <input
                  id="deduccion-inicio"
                  type="date"
                  {...register("fechaVigenciaInicio", {
                    required: "La fecha de inicio es obligatoria.",
                    onChange: (event) => setFechaInicio(event.target.value),
                  })}
                  aria-invalid={!!errors.fechaVigenciaInicio}
                  aria-describedby={errors.fechaVigenciaInicio ? "deduccion-inicio-error" : undefined}
                />
                {errors.fechaVigenciaInicio && (
                  <span id="deduccion-inicio-error" className="field-error" role="alert">
                    {errors.fechaVigenciaInicio.message}
                  </span>
                )}
              </label>

              <label htmlFor="deduccion-fin">
                Fin de vigencia (opcional)
                <input
                  id="deduccion-fin"
                  type="date"
                  disabled={!fechaInicio}
                  min={fechaInicio || undefined}
                  {...register("fechaVigenciaFin", {
                    validate: (valor) =>
                      !valor ||
                      valor >= getValues("fechaVigenciaInicio") ||
                      "La fecha de fin no puede ser anterior al inicio.",
                  })}
                  aria-invalid={!!errors.fechaVigenciaFin}
                  aria-describedby={errors.fechaVigenciaFin ? "deduccion-fin-error" : undefined}
                />
                {errors.fechaVigenciaFin && (
                  <span id="deduccion-fin-error" className="field-error" role="alert">
                    {errors.fechaVigenciaFin.message}
                  </span>
                )}
              </label>

              <label htmlFor="deduccion-porcentaje">
                Porcentaje (solo para tipo legal)
                <input
                  id="deduccion-porcentaje"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej. 5.50"
                  disabled={tipo !== "LEGAL"}
                  {...porcentajeRegistrado}
                  onChange={(event) => {
                    const valor = event.target.value.replace(",", ".");
                    if (
                      !/^\d{0,3}(?:\.\d{0,2})?$/.test(valor) ||
                      (valor !== "" && Number(valor) > 100)
                    ) {
                      event.target.value = getValues("porcentaje") ?? "";
                      return;
                    }
                    event.target.value = valor;
                    porcentajeRegistrado.onChange(event);
                  }}
                  aria-invalid={!!errors.porcentaje}
                  aria-describedby={errors.porcentaje ? "deduccion-porcentaje-error" : undefined}
                />
                {errors.porcentaje && (
                  <span id="deduccion-porcentaje-error" className="field-error" role="alert">
                    {errors.porcentaje.message}
                  </span>
                )}
              </label>
            </div>
            <p className="deducciones-form-hint">
              En las deducciones adicionales, el porcentaje se define al solicitarla.
            </p>
          </section>

          <div className="table-actions deducciones-form-actions">
            <Link className="button button-secondary" to="/deducciones">
              Cancelar
            </Link>
            <button className="button button-primary" type="submit">
              {isSubmitting ? "Creando..." : "Crear concepto"}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
