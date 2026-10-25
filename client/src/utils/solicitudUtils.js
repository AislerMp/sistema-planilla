export function ordenarSolicitudesPorEstado(solicitudes, rol) {
  // sort modifica el array: trabajamos con una copia de los datos recibidos.
  const ordenadas = [...(solicitudes ?? [])];
  const esGerente = rol === "GERENTE";
  const esAdministracion = ["RECURSOS_HUMANOS", "ADMINISTRADOR"].includes(rol);

  if (!esGerente && !esAdministracion) return ordenadas;

  const prioridades = esGerente
    ? { PENDIENTE: 0, EN_REVISION_RH: 1 }
    : { EN_REVISION_RH: 0, PENDIENTE: 1 };

  return ordenadas.sort((a, b) => {
    const prioridadA = prioridades[a.Estado] ?? 2;
    const prioridadB = prioridades[b.Estado] ?? 2;

    return prioridadA - prioridadB;
  });
}
