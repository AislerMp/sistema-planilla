import {
  Users,
  Store,
  BriefcaseBusiness,
  UserRoundCog,
  CalendarDays,
  ClipboardList,
  Clock3,
  History,
  HeartPulse,
  Settings2,
  ReceiptText,
} from "lucide-react";

export const menuGroups = [
  {
    id: "solicitudes",
    title: "Solicitudes y permisos",
    description: "Horas extras, permisos, incapacidades, vacaciones y deducciones en un mismo lugar.",
    icon: ClipboardList,
  },
  {
    id: "mantenimiento",
    title: "Mantenimiento",
    description: "Personal, restaurantes, puestos, deducciones y cuentas de acceso.",
    icon: Settings2,
  },
  {
    id: "administracion",
    title: "Planilla y administración",
    description: "Control de asistencia, períodos de pago e historial del sistema.",
    icon: BriefcaseBusiness,
  },
];

export function groupMenuItems(items) {
  return menuGroups
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

export const menuItems = [
  {
    title: "Bitácoras",
    path: "/bitacoras",
    group: "administracion",
    icon: History,
    description: "Historial de acciones y cambios del sistema.",
    showCount: false,
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Solicitudes de horas extras",
    path: "/solicitudes-horas-extras",
    group: "solicitudes",
    icon: Clock3,
    description: "Consulta y seguimiento de solicitudes de horas extras.",
    showCount: false,
    nonPermision: [],
  },
  {
    title: "Permisos laborales",
    path: "/permisos-laborales",
    group: "solicitudes",
    icon: CalendarDays,
    description: "Solicita y consulta permisos laborales.",
    showCount: false,
    nonPermision: [],
  },
  {
    title: "Incapacidades",
    path: "/incapacidades",
    group: "solicitudes",
    icon: HeartPulse,
    description: "Consulta y gestión de incapacidades médicas.",
    showCount: false,
    nonPermision: [],
  },
  {
    title: "Vacaciones",
    path: "/vacaciones",
    group: "solicitudes",
    icon: CalendarDays,
    description: "Saldo, solicitudes y seguimiento de vacaciones.",
    showCount: false,
    nonPermision: [],
  },
  {
    title: "Solicitudes de deducciones",
    path: "/solicitudes-deducciones",
    group: "solicitudes",
    icon: ReceiptText,
    description: "Solicitud y seguimiento de deducciones adicionales.",
    showCount: false,
    nonPermision: [],
  },
  {
    title: "Colaboradores",
    path: "/colaboradores",
    group: "mantenimiento",
    icon: Users,
    description: "Las personas, sus puestos y sus asignaciones.",
    label: "colaboradores activos",
    nonPermision: ["COLABORADOR"],
  },
  {
    title: "Restaurantes",
    path: "/restaurantes",
    group: "mantenimiento",
    icon: Store,
    description: "Ubicaciones y datos de cada restaurante.",
    label: "restaurantes activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Puestos",
    path: "/puestos",
    group: "mantenimiento",
    icon: BriefcaseBusiness,
    description: "Cargos y tarifas de pago por hora.",
    label: "puestos activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Deducciones",
    path: "/deducciones",
    group: "mantenimiento",
    icon: ReceiptText,
    description: "Conceptos legales y adicionales del catálogo.",
    showCount: false,
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Usuarios",
    path: "/usuarios",
    group: "mantenimiento",
    icon: UserRoundCog,
    description: "Cuentas y perfiles de acceso al sistema.",
    label: "usuarios activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Periodos de planilla",
    path: "/periodos",
    group: "administracion",
    icon: CalendarDays,
    description: "Ciclos de pago y seguimiento de sus etapas.",
    label: "periodos en gestión",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Marcas y asistencias",
    path: "/asistencia",
    group: "administracion",
    icon: ClipboardList,
    description: "Registro de entrada, salida y gestión de la jornada laboral.",
    showCount: false,
    nonPermision: [],
  },

];
