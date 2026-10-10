export function obtenerComparacionBitacora(bitacora) {
  const anteriores = bitacora?.DatosAnteriores ?? {};
  const nuevos = bitacora?.DatosNuevos ?? {};
  const esRevisionIncapacidad =
    bitacora?.Entidad === "SolicitudesIncapacidades" &&
    ["APROBAR_REVISION_INCAPACIDAD", "APROBAR_INCAPACIDAD", "RECHAZAR_INCAPACIDAD"].includes(bitacora?.Accion);

  if (!esRevisionIncapacidad) {
    return { anteriores, nuevos, calculo: null };
  }

  const { incapacidadActualizada, registroCalculoCreado, ...datosSolicitud } = nuevos;
  // Las revisiones históricas guardaban solo la cabecera actualizada.
  // Estas acciones no modifican las fechas, el comprobante ni el tipo.
  return {
    anteriores,
    nuevos: { ...anteriores, ...(incapacidadActualizada ?? datosSolicitud) },
    calculo: registroCalculoCreado ?? null,
  };
}
