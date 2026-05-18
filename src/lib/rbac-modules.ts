// Single source of truth for the RBAC module/sub-module registry.
// Both the editor (admin.rbac.tsx) and any future enforcement helpers
// import from here so module keys stay consistent.

import {
  BadgeCheck,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Clock,
  Coins,
  FileSignature,
  FileText,
  Files,
  HandCoins,
  LayoutDashboard,
  Languages,
  MapPin,
  Receipt,
  ReceiptText,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";

export type SubModuleDef = {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type ModuleDef = {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  subModules: SubModuleDef[];
};

export const RBAC_MODULES: ModuleDef[] = [
  {
    key: "organizations",
    label: "Organizations",
    path: "/admin/customers",
    icon: LayoutDashboard,
    subModules: [
      { key: "state_manager",        label: "State Manager",        path: "/admin/customers/state-manager",    icon: MapPin },
      { key: "branch_manager",       label: "Branch Manager",       path: "/admin/customers/branch-manager",   icon: Building2 },
      { key: "organization_manager", label: "Organization Manager", path: "/admin/customers/customer-manager", icon: Users },
      { key: "unit_manager",         label: "Unit Manager",         path: "/admin/customers/unit-manager",     icon: Warehouse },
    ],
  },
  {
    key: "contracts",
    label: "Contracts",
    path: "/admin/contracts/client-contracts",
    icon: Files,
    subModules: [
      { key: "client_contracts", label: "Client Contracts", path: "/admin/contracts/client-contracts", icon: FileText },
    ],
  },
  {
    key: "employees",
    label: "Employees",
    path: "/admin/employees",
    icon: UserPlus,
    subModules: [],
  },
  {
    key: "control_center",
    label: "Control Center",
    path: "/admin/control-center",
    icon: SlidersHorizontal,
    subModules: [
      { key: "professional_tax_manager", label: "Professional Tax Manager", path: "/admin/professional-tax-manager", icon: ReceiptText },
      { key: "lwf_manager",              label: "Labour Welfare Fund",      path: "/admin/lwf-manager",              icon: HandCoins },
      { key: "duty_manager",             label: "Duty Manager",             path: "/admin/duty-manager",             icon: Clock },
      { key: "service_type_manager",     label: "Service Type Manager",     path: "/admin/service-type-manager",     icon: Briefcase },
      { key: "payroll_manager",          label: "Payroll Manager",          path: "/admin/payroll-manager",          icon: CalendarRange },
      { key: "payroll_days_manager",     label: "Payroll Days Manager",     path: "/admin/payroll-days-manager",     icon: CalendarDays },
      { key: "allowance_manager",        label: "Allowance Manager",        path: "/admin/allowance-manager",        icon: Coins },
      { key: "billing_type_manager",     label: "Billing Type Manager",     path: "/admin/billing-type-manager",     icon: Receipt },
      { key: "designation_manager",      label: "Designation Manager",      path: "/admin/designation-manager",      icon: BadgeCheck },
      { key: "cost_component_manager",   label: "Cost Component Manager",   path: "/admin/cost-component-manager",   icon: Calculator },
      { key: "ex_service_manager",       label: "Ex-Service Manager",       path: "/admin/ex-service-manager",       icon: Shield },
      { key: "offboarding_reason_manager", label: "Offboarding Reason Manager", path: "/admin/offboarding-reason-manager", icon: LogOut },
      { key: "language_manager",         label: "Language Manager",         path: "/admin/language-manager",         icon: Languages },
      { key: "company_documents",        label: "Company Documents",        path: "/admin/company-documents",        icon: FileSignature },
      { key: "system_logs",              label: "System Logs",              path: "/admin/system-logs",              icon: ClipboardList },
    ],
  },
  {
    key: "rbac",
    label: "Role-Based Access Control",
    path: "/admin/rbac",
    icon: ShieldCheck,
    subModules: [],
  },
];

export type PermissionAction = "view" | "edit" | "delete";
export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "edit", "delete"];
