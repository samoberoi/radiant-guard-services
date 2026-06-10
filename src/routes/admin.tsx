import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserPlus,
  Users,
  Warehouse,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useCurrentPermissions } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type LeafItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  search?: Record<string, unknown>;
};

type GroupItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** module key for RBAC `can()`. Group hidden if user can't view. */
  module?: string;
  /** Single link group (no dropdown) */
  to?: string;
  /** Dropdown children */
  children?: LeafItem[];
  /** Active path prefixes */
  activePrefixes?: string[];
};

const customersChildren: LeafItem[] = [
  { to: "/admin/customers/state-manager", label: "State Manager", icon: MapPin },
  { to: "/admin/customers/branch-manager", label: "Branch Manager", icon: Building2 },
  { to: "/admin/customers/customer-manager", label: "Organization Manager", icon: Users },
  { to: "/admin/customers/unit-manager", label: "Unit Manager", icon: Warehouse },
];

const contractsChildren: LeafItem[] = [
  { to: "/admin/contracts/client-contracts", label: "Client Contracts", icon: FileText },
];

const vehiclesChildren: LeafItem[] = [
  { to: "/admin/vehicles/inventory", label: "Vehicle Inventory", icon: Car },
  { to: "/admin/vehicles/fastags", label: "FastTag Manager", icon: CreditCard },
  { to: "/admin/vehicles/insurances", label: "Insurance Manager", icon: ShieldCheck },
  { to: "/admin/vehicles/pucs", label: "PUC Manager", icon: Wind },
  { to: "/admin/vehicles/service-manager", label: "Service Manager", icon: Wrench },
  { to: "/admin/vehicles/expense-manager", label: "Expense Manager", icon: Fuel },
];

const inventoryChildren: LeafItem[] = [
  { to: "/admin/inventory/items", label: "Products", icon: PackageOpen },
  { to: "/admin/inventory/vendors", label: "Vendors", icon: ShoppingBag },
  { to: "/admin/inventory/warehouses", label: "Warehouses", icon: Warehouse },
  { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", icon: FileText },
  { to: "/admin/inventory/goods-receipts", label: "Delivery Challans", icon: ClipboardList },
  { to: "/admin/inventory/transfers", label: "Transfers", icon: Boxes },
  { to: "/admin/inventory/issuances", label: "Issuances", icon: UserPlus },
  { to: "/admin/inventory/write-offs", label: "Write-offs", icon: ShieldCheck },
  { to: "/admin/inventory/adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { to: "/admin/inventory/stock", label: "Stock Report", icon: Wallet },
  { to: "/admin/inventory/rate-cards", label: "Vendor Rate Cards", icon: FileText },
];

const payrollChildren: LeafItem[] = [
  { to: "/admin/payroll", label: "Payroll Runs", icon: Wallet },
  { to: "/admin/additions", label: "Additions", icon: Wallet, search: { mode: "list" } },
  { to: "/admin/deductions", label: "Deductions", icon: Wallet, search: { mode: "list" } },
];

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `+91 ••• ••• ${d.slice(-4)}`;
}

function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout, isReady } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can, isLoading: permsLoading, isSuperAdmin, roleKey } = useCurrentPermissions();
  const dashboardHref =
    roleKey === "field_officer" && !isSuperAdmin ? "/admin/field-dashboard" : "/admin/dashboard";

  const [mobileOpen, setMobileOpen] = useState(false);

  // Path → module map for RBAC redirects (unchanged behavior).
  const pathToModule: { prefix: string; module: string }[] = [
    { prefix: "/admin/customers", module: "organizations" },
    { prefix: "/admin/contracts", module: "contracts" },
    { prefix: "/admin/employees", module: "employees" },
    { prefix: "/admin/deductions", module: "payroll" },
    { prefix: "/admin/additions", module: "payroll" },
    { prefix: "/admin/deduction-type-manager", module: "control_center" },
    { prefix: "/admin/addition-type-manager", module: "control_center" },
    { prefix: "/admin/vehicles", module: "vehicles" },
    { prefix: "/admin/inventory", module: "inventory" },
    { prefix: "/admin/attendance", module: "attendance" },
    { prefix: "/admin/payroll", module: "payroll" },
    { prefix: "/admin/invoice", module: "invoice" },
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
    const order = [
      "organizations","contracts","employees","vehicles","inventory","attendance",
      "payroll","invoice","control_center","notification_center","rbac",
    ];
    const pathFor: Record<string, string> = {
      organizations: "/admin/customers",
      contracts: "/admin/contracts/client-contracts",
      employees: "/admin/employees",
      vehicles: "/admin/vehicles/inventory",
      inventory: "/admin/inventory",
      attendance: "/admin/attendance",
      payroll: "/admin/payroll",
      invoice: "/admin/invoice",
      control_center: "/admin/control-center",
      notification_center: "/admin/notifications",
      rbac: "/admin/rbac",
    };
    for (const m of order) if (can(m)) return pathFor[m];
    return null;
  };
  useEffect(() => {
    if (!isReady || permsLoading || !user) return;
    const hit = pathToModule.find((p) => pathname === p.prefix || pathname.startsWith(p.prefix + "/"));
    if (!hit) return;
    if (!can(hit.module)) {
      const dest = firstAllowedPath();
      if (dest) navigate({ to: dest, replace: true });
      else logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, permsLoading, isSuperAdmin, isReady]);

  // Auth guard — wait for hydration; if no token in storage, kick to login.
  useEffect(() => {
    if (!isReady) return;
    if (!user) navigate({ to: "/login", replace: true });
  }, [user, isReady, navigate]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleLogout() {
    logout();
    navigate({ to: "/login", replace: true });
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const groups: GroupItem[] = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: dashboardHref, activePrefixes: ["/admin/dashboard", "/admin/field-dashboard"] },
      { key: "organizations", label: "Organizations", module: "organizations", icon: Building2, children: customersChildren, activePrefixes: ["/admin/customers"] },
      { key: "contracts", label: "Contracts", module: "contracts", icon: Files, children: contractsChildren, activePrefixes: ["/admin/contracts"] },
      { key: "employees", label: "Employees", module: "employees", icon: UserPlus, to: "/admin/employees", activePrefixes: ["/admin/employees"] },
      { key: "attendance", label: "Attendance", module: "attendance", icon: ClipboardList, to: "/admin/attendance", activePrefixes: ["/admin/attendance"] },
      { key: "payroll", label: "Payroll", module: "payroll", icon: Wallet, children: payrollChildren, activePrefixes: ["/admin/payroll", "/admin/additions", "/admin/deductions"] },
      { key: "invoice", label: "Invoice", module: "invoice", icon: CreditCard, to: "/admin/invoice", activePrefixes: ["/admin/invoice"] },
      { key: "inventory", label: "Inventory", module: "inventory", icon: Boxes, children: inventoryChildren, activePrefixes: ["/admin/inventory"] },
      { key: "vehicles", label: "Vehicles", module: "vehicles", icon: Car, children: vehiclesChildren, activePrefixes: ["/admin/vehicles"] },
      { key: "control", label: "Control Center", module: "control_center", icon: SlidersHorizontal, to: "/admin/control-center", activePrefixes: ["/admin/control-center"] },
    ],
    [dashboardHref],
  );

  const visibleGroups = groups.filter((g) => !g.module || can(g.module));
  const isGroupActive = (g: GroupItem) =>
    (g.activePrefixes ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <div className="relative min-h-screen bg-background">
      <div className="ambient-glow pointer-events-none absolute inset-0" />

      {/* Top nav bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link to={dashboardHref} className="flex shrink-0 items-center gap-2">
            <BrandMark className="min-w-0" />
          </Link>

          {/* Desktop top nav */}
          <nav className="scrollbar-hide ml-3 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {visibleGroups.map((g) => {
              const active = isGroupActive(g);
              if (!g.children || g.children.length === 0) {
                return (
                  <Link
                    key={g.key}
                    to={g.to!}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                      active
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <g.icon className="h-4 w-4" />
                    {g.label}
                  </Link>
                );
              }
              return (
                <DropdownMenu key={g.key}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors focus:outline-none",
                        active
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <g.icon className="h-4 w-4" />
                      {g.label}
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="w-60 rounded-xl border-border p-1.5"
                  >
                    <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {g.label}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {g.children.map((c) => {
                      const a = isActive(c.to);
                      return (
                        <DropdownMenuItem key={c.to} asChild className="rounded-lg p-0">
                          <Link
                            to={c.to}
                            search={c.search as never}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                              a
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-secondary",
                            )}
                          >
                            <c.icon className="h-4 w-4 opacity-80" />
                            <span className="truncate">{c.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                    {(user?.phone ?? "U").slice(-2)}
                  </span>
                  <span className="hidden max-w-[140px] truncate sm:inline">
                    {user?.phone ? maskPhone(user.phone) : "Account"}
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 sm:inline" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-xl">
                <DropdownMenuLabel>
                  <div className="text-sm font-semibold text-foreground">
                    {user?.phone ? maskPhone(user.phone) : "Account"}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ")}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/profile" className="flex items-center gap-2">
                    <Users className="h-4 w-4" /> My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin/notifications" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" /> Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground hover:bg-secondary lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-[86%] max-w-sm overflow-y-auto bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1.5 text-foreground hover:bg-secondary"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {visibleGroups.map((g) => (
                <MobileGroup key={g.key} group={g} isActive={isActive} isGroupActive={isGroupActive(g)} />
              ))}
              <div className="my-2 border-t border-border" />
              <Link
                to="/admin/profile"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <Users className="h-4 w-4" /> My Profile
              </Link>
              <Link
                to="/admin/notifications"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <Bell className="h-4 w-4" /> Notifications
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </aside>
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function MobileGroup({
  group,
  isActive,
  isGroupActive,
}: {
  group: GroupItem;
  isActive: (p: string) => boolean;
  isGroupActive: boolean;
}) {
  const [open, setOpen] = useState(isGroupActive);
  const Icon = group.icon;
  if (!group.children || group.children.length === 0) {
    return (
      <Link
        to={group.to!}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
          isGroupActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-secondary",
        )}
      >
        <Icon className="h-4 w-4" />
        {group.label}
      </Link>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
          isGroupActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-secondary",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-4">
          {group.children.map((c) => {
            const a = isActive(c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                search={c.search as never}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium",
                  a ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-secondary",
                )}
              >
                <c.icon className="h-4 w-4 opacity-80" />
                <span className="truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
