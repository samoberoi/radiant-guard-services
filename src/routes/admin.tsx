import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Boxes,
  ChevronDown,
  ClipboardList,
  Wallet,
  FileText,
  Files,
  Fuel,
  LayoutDashboard,
  LogOut,
  Car,
  CreditCard,
  MapPin,
  Menu,
  PackageOpen,
  PanelLeftClose,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  SlidersHorizontal,
  UserPlus,
  Users,
  Warehouse,
  Wind,
  Wrench,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { useCurrentPermissions } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const customersChildren: NavItem[] = [
  { to: "/admin/customers/state-manager", label: "State Manager", icon: MapPin },
  { to: "/admin/customers/branch-manager", label: "Branch Manager", icon: Building2 },
  { to: "/admin/customers/customer-manager", label: "Organization Manager", icon: Users },
  { to: "/admin/customers/unit-manager", label: "Unit Manager", icon: Warehouse },
];

const contractsChildren: NavItem[] = [
  { to: "/admin/contracts/client-contracts", label: "Client Contracts", icon: FileText },
];

const vehiclesChildren: NavItem[] = [
  { to: "/admin/vehicles/inventory", label: "Vehicle Inventory", icon: Car },
  { to: "/admin/vehicles/fastags", label: "FastTag Manager", icon: CreditCard },
  { to: "/admin/vehicles/insurances", label: "Insurance Manager", icon: ShieldCheck },
  { to: "/admin/vehicles/pucs", label: "PUC Manager", icon: Wind },
  { to: "/admin/vehicles/service-manager", label: "Service Manager", icon: Wrench },
  { to: "/admin/vehicles/expense-manager", label: "Expense Manager", icon: Fuel },
  { to: "/admin/vehicles/insight-lab", label: "Insight Lab", icon: Sparkles },
];

const inventoryChildren: NavItem[] = [
  { to: "/admin/inventory/dashboard", label: "Owner Dashboard", icon: AlertTriangle },
  { to: "/admin/inventory/items", label: "Item Master", icon: PackageOpen },
  { to: "/admin/inventory/vendors", label: "Vendors", icon: ShoppingBag },
  { to: "/admin/inventory/warehouses", label: "Warehouses", icon: Warehouse },
  { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", icon: FileText },
  { to: "/admin/inventory/goods-receipts", label: "Goods Receipts", icon: ClipboardList },
  { to: "/admin/inventory/transfers", label: "Transfers", icon: Boxes },
  { to: "/admin/inventory/issuances", label: "Issuances", icon: UserPlus },
  { to: "/admin/inventory/write-offs", label: "Write-offs", icon: ShieldCheck },
  { to: "/admin/inventory/adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { to: "/admin/inventory/stock", label: "Stock Report", icon: Wallet },
  { to: "/admin/inventory/rate-cards", label: "Vendor Rate Cards", icon: FileText },
  { to: "/admin/inventory/settings", label: "Inventory Settings", icon: SlidersHorizontal },
];


function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `+91 ••• ••• ${d.slice(-4)}`;
}

function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, isLoading: permsLoading, isSuperAdmin } = useCurrentPermissions();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // Map current path → module key, then redirect if user lacks view perm.
  const pathToModule: { prefix: string; module: string }[] = [
    { prefix: "/admin/customers", module: "organizations" },
    { prefix: "/admin/contracts", module: "contracts" },
    { prefix: "/admin/employees", module: "employees" },
    { prefix: "/admin/vehicles", module: "vehicles" },
    { prefix: "/admin/inventory", module: "inventory" },
    { prefix: "/admin/attendance", module: "attendance" },
    { prefix: "/admin/payroll", module: "payroll" },
    { prefix: "/admin/notifications", module: "notification_center" },
    { prefix: "/admin/rbac", module: "rbac" },
    { prefix: "/admin/control-center", module: "control_center" },
    { prefix: "/admin/professional-tax-manager", module: "control_center" },
    { prefix: "/admin/lwf-manager", module: "control_center" },
    { prefix: "/admin/duty-manager", module: "control_center" },
    { prefix: "/admin/service-type-manager", module: "control_center" },
    { prefix: "/admin/payroll-manager", module: "control_center" },
    { prefix: "/admin/payroll-days-manager", module: "control_center" },
    { prefix: "/admin/allowance-manager", module: "control_center" },
    { prefix: "/admin/billing-type-manager", module: "control_center" },
    { prefix: "/admin/designation-manager", module: "control_center" },
    { prefix: "/admin/cost-component-manager", module: "control_center" },
    { prefix: "/admin/ex-service-manager", module: "control_center" },
    { prefix: "/admin/offboarding-reason-manager", module: "control_center" },
    { prefix: "/admin/language-manager", module: "control_center" },
    { prefix: "/admin/company-documents", module: "control_center" },
    { prefix: "/admin/system-logs", module: "control_center" },
    { prefix: "/admin/asset-manager", module: "control_center" },
    { prefix: "/admin/attendance-code-manager", module: "control_center" },
    { prefix: "/admin/esic-branch-manager", module: "control_center" },
  ];
  const firstAllowedPath = () => {
    const order = ["organizations","contracts","employees","vehicles","inventory","attendance","payroll","control_center","notification_center","rbac"];
    const pathFor: Record<string,string> = {
      organizations: "/admin/customers", contracts: "/admin/contracts/client-contracts",
      employees: "/admin/employees", vehicles: "/admin/vehicles/inventory",
      inventory: "/admin/inventory", attendance: "/admin/attendance",
      payroll: "/admin/payroll", control_center: "/admin/control-center",
      notification_center: "/admin/notifications", rbac: "/admin/rbac",
    };
    for (const m of order) if (can(m)) return pathFor[m];
    return null;
  };
  useEffect(() => {
    if (permsLoading || !user) return;
    const hit = pathToModule.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + "/"));
    if (!hit) return;
    if (!can(hit.module)) {
      const dest = firstAllowedPath();
      if (dest) navigate({ to: dest, replace: true });
      else logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, permsLoading, isSuperAdmin]);

  
  

  // Auth guard — wait for hydration; if no token in storage, kick to login.
  useEffect(() => {
    if (user === null) {
      const t = setTimeout(() => {
        if (typeof window !== "undefined" && !localStorage.getItem("radiant.auth")) {
          navigate({ to: "/login", replace: true });
        }
      }, 50);
      return () => clearTimeout(t);
    }
  }, [user, navigate]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    navigate({ to: "/login", replace: true });
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const sidebarWidth = collapsed ? "lg:w-20" : "lg:w-64";

  return (
    <div className="relative min-h-screen bg-background">
      <div className="ambient-glow pointer-events-none absolute inset-0" />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border/60 bg-primary text-primary-foreground transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          sidebarWidth,
        )}
      >
        <div className="dot-pattern pointer-events-none absolute inset-0 opacity-20" />

        {/* Brand */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Link to="/admin/customers" className="flex items-center gap-2.5">
            <BrandMark
              compact={collapsed}
              variant="inverse"
              className="min-w-0"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 overflow-y-auto p-3">
          <div className="mb-2 px-3">
            {!collapsed && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/50">
                Main
              </div>
            )}
          </div>

          {/* Customers group */}
          <div>
            <div
              className={cn(
                "group flex w-full items-center gap-1 rounded-lg pr-1 text-sm font-semibold transition-colors",
                isActive("/admin/customers")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
              )}
            >
              <Link
                to="/admin/customers"
                onClick={() => setCustomersOpen(true)}
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <LayoutDashboard className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span className="flex-1 text-left">Organizations</span>}
              </Link>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setCustomersOpen((v) => !v)}
                  aria-label={customersOpen ? "Collapse" : "Expand"}
                  className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      customersOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {customersOpen && !collapsed && (
              <div className="mt-1 space-y-0.5 pl-3">
                {customersChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-primary-foreground"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 h-5 w-0.5 rounded-r bg-accent transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Collapsed icon-only children */}
            {collapsed && (
              <div className="mt-1 space-y-1">
                {customersChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-2.5 transition-colors",
                        active
                          ? "bg-accent/20 text-accent"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Contracts group */}
          <div className="mt-2">
            <div
              className={cn(
                "group flex w-full items-center gap-1 rounded-lg pr-1 text-sm font-semibold transition-colors",
                isActive("/admin/contracts")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
              )}
            >
              <Link
                to="/admin/contracts/client-contracts"
                onClick={() => setContractsOpen(true)}
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <Files className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span className="flex-1 text-left">Contracts</span>}
              </Link>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setContractsOpen((v) => !v)}
                  aria-label={contractsOpen ? "Collapse" : "Expand"}
                  className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      contractsOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {contractsOpen && !collapsed && (
              <div className="mt-1 space-y-0.5 pl-3">
                {contractsChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-primary-foreground"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 h-5 w-0.5 rounded-r bg-accent transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {collapsed && (
              <div className="mt-1 space-y-1">
                {contractsChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-2.5 transition-colors",
                        active
                          ? "bg-accent/20 text-accent"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Employees link */}
          <div className="mt-2">
            <Link
              to="/admin/employees"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive("/admin/employees")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
                collapsed && "justify-center",
              )}
              title={collapsed ? "Employees" : undefined}
            >
              <UserPlus className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>Employees</span>}
            </Link>
          </div>

          {/* Vehicles group */}
          <div className="mt-2">
            <div
              className={cn(
                "group flex w-full items-center gap-1 rounded-lg pr-1 text-sm font-semibold transition-colors",
                isActive("/admin/vehicles")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
              )}
            >
              <Link
                to="/admin/vehicles"
                onClick={() => setVehiclesOpen(true)}
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <Car className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span className="flex-1 text-left">Vehicles</span>}
              </Link>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setVehiclesOpen((v) => !v)}
                  aria-label={vehiclesOpen ? "Collapse" : "Expand"}
                  className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      vehiclesOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {vehiclesOpen && !collapsed && (
              <div className="mt-1 space-y-0.5 pl-3">
                {vehiclesChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-primary-foreground"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 h-5 w-0.5 rounded-r bg-accent transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {collapsed && (
              <div className="mt-1 space-y-1">
                {vehiclesChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-2.5 transition-colors",
                        active
                          ? "bg-accent/20 text-accent"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inventory group */}
          <div className="mt-2">
            <div
              className={cn(
                "group flex w-full items-center gap-1 rounded-lg pr-1 text-sm font-semibold transition-colors",
                isActive("/admin/inventory")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
              )}
            >
              <Link
                to="/admin/inventory"
                onClick={() => setInventoryOpen(true)}
                className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <Boxes className="h-4.5 w-4.5 shrink-0" />
                {!collapsed && <span className="flex-1 text-left">Inventory</span>}
              </Link>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setInventoryOpen((v) => !v)}
                  aria-label={inventoryOpen ? "Collapse" : "Expand"}
                  className="rounded-md p-1.5 text-primary-foreground/70 hover:bg-white/10"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      inventoryOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
              )}
            </div>

            {inventoryOpen && !collapsed && (
              <div className="mt-1 space-y-0.5 pl-3">
                {inventoryChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-primary-foreground"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-0 h-5 w-0.5 rounded-r bg-accent transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {collapsed && (
              <div className="mt-1 space-y-1">
                {inventoryChildren.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-2.5 transition-colors",
                        active
                          ? "bg-accent/20 text-accent"
                          : "text-primary-foreground/65 hover:bg-white/5 hover:text-primary-foreground",
                      )}
                    >
                      <item.icon className="h-4.5 w-4.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>




          {/* Attendance link */}
          <div className="mt-2">
            <Link
              to="/admin/attendance"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive("/admin/attendance")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
                collapsed && "justify-center",
              )}
              title={collapsed ? "Attendance" : undefined}
            >
              <ClipboardList className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>Attendance</span>}
            </Link>
          </div>

          {/* Payroll link */}
          <div className="mt-2">
            <Link
              to="/admin/payroll"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive("/admin/payroll")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
                collapsed && "justify-center",
              )}
              title={collapsed ? "Payroll" : undefined}
            >
              <Wallet className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>Payroll</span>}
            </Link>
          </div>

          {/* Control Center link */}
          <div className="mt-2">
            <Link
              to="/admin/control-center"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive("/admin/control-center") ||
                  isActive("/admin/professional-tax-manager") ||
                  isActive("/admin/lwf-manager")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
                collapsed && "justify-center",
              )}
              title={collapsed ? "Control Center" : undefined}
            >
              <SlidersHorizontal className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>Control Center</span>}
            </Link>
          </div>

          {/* Notification Center link */}
          <div className="mt-2">
            <Link
              to="/admin/notifications"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive("/admin/notifications")
                  ? "bg-accent/20 text-accent"
                  : "text-primary-foreground/85 hover:bg-white/5",
                collapsed && "justify-center",
              )}
              title={collapsed ? "Notification Center" : undefined}
            >
              <Bell className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>Notification Center</span>}
            </Link>
          </div>


        </nav>

        {/* Footer */}
        <div className="relative border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground/60 transition-colors hover:bg-white/5 hover:text-primary-foreground lg:flex"
          >
            <PanelLeftClose
              className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main column */}
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-300", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-secondary lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Admin Console
            </span>
          </div>


          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground sm:flex">
              <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
              {user?.role === "super_admin" ? "Super Admin" : "User"}
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">
                {user ? maskPhone(user.phone) : "—"}
              </span>
            </div>
            <NotificationBell />
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="h-9 rounded-lg border-border bg-card text-foreground font-semibold hover:bg-accent hover:text-accent-foreground hover:border-accent"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Sign out
            </Button>
          </div>

        </header>

        <main className="relative z-10 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
