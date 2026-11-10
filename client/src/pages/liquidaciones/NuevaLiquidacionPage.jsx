import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import AlertMessage from "../../components/AlertMessage.jsx";
import LoadingState from "../../components/loadingState.jsx";
import useAsyncRequest from "../../hooks/useAsyncRequest.js";
import { getColaborador } from "../../services/colaboradores.Service.js";
import { getRestaurante } from "../../services/restaurantes.Service.js";
import {
  calcularLiquidacion,
  confirmarLiquidacion,
} from "../../services/liquidaciones.Service.js";
import { notifySuccess } from "../../utils/notifications.js";
import { adaptarColaboradorLiquidacion } from "../../utils/liquidacionesUtils.js";
import { obtenerFechaHoyCostaRica } from "../../utils/fechaUtils.js";
import {
  ConfirmarLiquidacionModal,
  DesgloseLiquidacion,
  EncabezadoLiquidaciones,
  FichaColaborador,
  FormularioSalida,
  moneda,
} from "./ComponentesLiquidacion.jsx";

function PreparacionLiquidacion({ colaborador }) {
  const { user } = useAuth();

  const [datos, setDatos] = useState({
    fechaSalida: obtenerFechaHoyCostaRica(),
    motivoSalida: "DESPIDO_CON_RESPONSABILIDAD",
    diasPreavisoTrabajados: "0",
    observacion: "",
  });

  const {
    data: calculo,
    isLoading,
    error,
  } = useAsyncRequest(
    () => calcularLiquidacion(colaborador.id, datos),
    [colaborador.id, datos],
  );

  const [resultado, setResultado] = useState(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [registro, setRegistro] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState(null);
  const registroEnCurso = useRef(false);

  function cambiarDato(campo, valor) {
    if (registroEnCurso.current || registro) return;
    setDatos((anteriores) => ({
      ...anteriores,
      [campo]: valor,
    }));
    setResultado(null);
    setMostrarConfirmacion(false);
    setErrorRegistro(null);
  }

  function mostrarCalculo(event) {
    event.preventDefault();
    if (isLoading || error || !calculo || registroEnCurso.current || registro)
      return;
    setResultado(calculo);
    setErrorRegistro(null);
  }

  function cerrarConfirmacion() {
    if (!registroEnCurso.current) setMostrarConfirmacion(false);
  }

  async function registrarLiquidacion() {
    if (
      registroEnCurso.current ||
      registro ||
      !resultado ||
      user?.Rol !== "RECURSOS_HUMANOS"
    )
      return;

    registroEnCurso.current = true;
    setRegistrando(true);
    setErrorRegistro(null);

    try {
      const respuesta = await confirmarLiquidacion(colaborador.id, datos);
      setRegistro(respuesta);
      setMostrarConfirmacion(false);
      notifySuccess(
        respuesta.message || "Liquidación registrada correctamente.",
      );
    } catch (err) {
      setErrorRegistro(
        err.message || "No se pudo registrar la liquidación. Intentá de nuevo.",
      );
    } finally {
      registroEnCurso.current = false;
      setRegistrando(false);
    }
  }

  if (registro) {
    const liquidacion = registro.liquidacion;
    return (
      <>
        <FichaColaborador colaborador={colaborador} compacta />
        <section
          className="data-panel catalog-form"
          aria-label="Confirmación del registro"
        >
          <AlertMessage type="success" title="Liquidación registrada">
            {registro.message || "Liquidación registrada correctamente."}
          </AlertMessage>
          <dl className="liquidacion-datos">
            <div>
              <dt>Número de liquidación</dt>
              <dd>
                {liquidacion?.LiquidacionId == null
                  ? "—"
                  : `#${liquidacion.LiquidacionId}`}
              </dd>
            </div>
            <div>
              <dt>Colaborador</dt>
              <dd>
                {colaborador.nombres} {colaborador.apellidos}
              </dd>
            </div>
            <div>
              <dt>Estado del colaborador</dt>
              <dd>Inactivo</dd>
            </div>
          </dl>
          <div className="liquidacion-total">
            <span>Total registrado</span>
            <strong>
              {liquidacion?.TotalLiquidacion == null
                ? "—"
                : moneda.format(liquidacion.TotalLiquidacion)}
            </strong>
          </div>
          <div className="solicitud-create-actions">
            <Link to="/liquidaciones" className="button button-secondary">
              <ArrowLeft size={16} aria-hidden="true" />
              Volver a colaboradores
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <FichaColaborador colaborador={colaborador} compacta />
      <div className="liquidacion-preparacion-layout">
        <FormularioSalida
          datos={datos}
          onChange={cambiarDato}
          onCalcular={mostrarCalculo}
          calculando={isLoading}
          deshabilitado={!calculo || !!error}
          ocupado={registrando}
        />

        <aside
          className="data-panel liquidacion-resumen"
          aria-label="Resumen de liquidación"
        >
          <div className="liquidacion-resumen-titulo">
            <h2>Resumen de liquidación</h2>
            <span className="liquidacion-etiqueta">
              {resultado ? "Preliminar" : "Sin calcular"}
            </span>
          </div>
          <AlertMessage title="No se pudo calcular la liquidación">
            {error}
          </AlertMessage>
          {isLoading && (
            <LoadingState
              mensaje="Consultando la base de cálculo..."
              compacto
            />
          )}
          {resultado ? (
            <>
              <DesgloseLiquidacion
                resultado={resultado}
                preliminar
                mostrarBase
                colaborador={colaborador}
              />
              {user?.Rol === "RECURSOS_HUMANOS" && (
                <button
                  type="button"
                  className="button button-primary liquidacion-boton-completo"
                  disabled={registrando}
                  onClick={() => {
                    setErrorRegistro(null);
                    setMostrarConfirmacion(true);
                  }}
                >
                  <ShieldCheck size={17} aria-hidden="true" />
                  Liquidar colaborador
                </button>
              )}
              <p className="liquidacion-nota">
                Revisá los datos de salida y la base del cálculo antes de
                continuar.
              </p>
            </>
          ) : (
            <div className="liquidacion-resumen-vacio">
              <span className="liquidacion-calculadora">
                <Calculator size={29} aria-hidden="true" />
              </span>
              <h3>Tu resumen aparecerá aquí</h3>
              <p>
                Completá los datos de salida y seleccioná “Calcular liquidación”
                para revisar su desglose.
              </p>
            </div>
          )}
        </aside>
      </div>
      {mostrarConfirmacion && resultado && user?.Rol === "RECURSOS_HUMANOS" && (
        <ConfirmarLiquidacionModal
          colaborador={colaborador}
          fechaSalida={datos.fechaSalida}
          resultado={resultado}
          onCerrar={cerrarConfirmacion}
          onConfirmar={registrarLiquidacion}
          registrando={registrando}
          error={errorRegistro}
        />
      )}
    </>
  );
}
export default function NuevaLiquidacionPage() {
  const { colaboradorId } = useParams();
  const {
    data: colaborador,
    isLoading,
    error,
  } = useAsyncRequest(async () => {
    const persona = await getColaborador(colaboradorId);
    if (!persona) return null;
    // La consulta individual devuelve el puesto, pero puede omitir el restaurante.
    const restaurante =
      persona.NombreRestaurante || !persona.RestauranteId
        ? null
        : await getRestaurante(persona.RestauranteId);
    return adaptarColaboradorLiquidacion({
      ...persona,
      NombreRestaurante: persona.NombreRestaurante ?? restaurante?.Nombre,
    });
  }, [colaboradorId]);
  return (
    <div className="liquidaciones-page">
      <EncabezadoLiquidaciones
        titulo="Preparar liquidación"
        descripcion="Revisá los datos de salida y el desglose preliminar del colaborador."
      />
      {isLoading ? (
        <LoadingState mensaje="Cargando colaborador..." />
      ) : !error && colaborador?.activo ? (
        <PreparacionLiquidacion
          key={colaborador.id}
          colaborador={colaborador}
        />
      ) : (
        <section className="data-panel liquidacion-no-encontrado">
          <AlertMessage type="warning" title="Colaborador no disponible">
            {error ||
              (colaborador
                ? "El colaborador seleccionado no está activo."
                : "No encontramos al colaborador seleccionado.")}
          </AlertMessage>
          <Link to="/liquidaciones" className="button button-secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Regresar a colaboradores
          </Link>
        </section>
      )}
    </div>
  );
}
