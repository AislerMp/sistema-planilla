import {
  ArrowRight,
  ArrowUpRight,
  Users,
  Store,
  BriefcaseBusiness,
  UserRoundCog,
  CalendarDays,
  ClipboardList,
} from "lucide-react";


export const menuItems = [
  {
    title: "Colaboradores",
    path: "/colaboradores",
    icon: Users,
    description: "Las personas, sus puestos y sus asignaciones.",
    label: "colaboradores activos",
    nonPermision: ["COLABORADOR"],
  },
  {
    title: "Restaurantes",
    path: "/restaurantes",
    icon: Store,
    description: "Ubicaciones y datos de cada restaurante.",
    label: "restaurantes activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Puestos",
    path: "/puestos",
    icon: BriefcaseBusiness,
    description: "Cargos y tarifas de pago por hora.",
    label: "puestos activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Usuarios",
    path: "/usuarios",
    icon: UserRoundCog,
    description: "Cuentas y perfiles de acceso al sistema.",
    label: "usuarios activos",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Periodos de planilla",
    path: "/periodos",
    icon: CalendarDays,
    description: "Ciclos de pago y seguimiento de sus etapas.",
    label: "periodos en gestión",
    nonPermision: ["COLABORADOR", "GERENTE"],
  },
  {
    title: "Marcas y asistencias",
    path: "/asistencia",
    icon: ClipboardList,
    description: "Registro de entrada, salida y gestión de la jornada laboral.",
    showCount: false,
    nonPermision: [],
  },
];
