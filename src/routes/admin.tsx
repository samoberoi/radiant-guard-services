import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Boxes,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
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
  module?: string;
  to?: string;
  children?: LeafItem[];
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
  const [collapsed, setCollapsed] = useState(false);

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

  useEffect(() => {
    if (!isReady) return;
    if (!user) navigate({ to: "/login", replace: true });
  }, [user, isReady, navigate]);

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

  const sidebarWidth = collapsed ? "lg:w-[76px]" : "lg:w-[260px]";
  const mainPad = collapsed ? "lg:pl-[100px]" : "lg:pl-[284px]";

  return (
    <div className="relative min-h-screen">
      {/* Soft tinted canvas — clean glass backdrop, no grid */}
      <div className="pointer-events-none fixed inset-0 z-0 app-canvas" />




      {/* Desktop vertical sidebar — glass / iPadOS */}
      <aside
        className={cn(
          "fixed inset-y-3 left-3 z-30 hidden flex-col rounded-3xl border border-white/40 bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.18)] backdrop-blur-2xl backdrop-saturate-150 transition-[width] duration-300 lg:flex",
          sidebarWidth,
        )}
      >
        {/* Brand */}
        <div className={cn("flex items-center gap-2 px-4 pt-5 pb-4", collapsed && "justify-center px-2")}>
          {collapsed ? (
            <Link to={dashboardHref} className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground font-bold">
              R
            </Link>
          ) : (
            <Link to={dashboardHref} className="flex min-w-0 items-center gap-2">
              <BrandMark />
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-3">
          <div className="space-y-1">
            {visibleGroups.map((g) => (
              <SidebarGroup
                key={g.key}
                group={g}
                collapsed={collapsed}
                isActive={isActive}
                groupActive={isGroupActive(g)}
              />
            ))}
          </div>
        </nav>

        {/* Footer: user + collapse */}
        <div className="border-t border-white/40 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl border border-white/40 bg-white/60 p-2 text-sm font-semibold text-foreground transition hover:bg-white/80",
                  collapsed && "justify-center p-1.5",
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground text-[11px] font-bold">
                  {(user?.phone ?? "U").slice(-2)}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left text-[13px]">
                      {user?.phone ? maskPhone(user.phone) : "Account"}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" sideOffset={10} className="w-56 rounded-2xl">
              <DropdownMenuLabel>
                <div className="text-sm font-semibold">{user?.phone ? maskPhone(user.phone) : "Account"}</div>
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
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-white/60 hover:text-foreground",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-white/40 bg-white/60 px-4 backdrop-blur-2xl backdrop-saturate-150 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/50 bg-white/70 text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to={dashboardHref} className="ml-1 flex min-w-0 items-center gap-2">
          <BrandMark />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-2 left-2 w-[86%] max-w-sm overflow-y-auto rounded-3xl border border-white/40 bg-white/80 p-4 shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {visibleGroups.map((g) => (
                <MobileGroup key={g.key} group={g} isActive={isActive} isGroupActive={isGroupActive(g)} />
              ))}
              <div className="my-2 border-t border-white/40" />
              <Link
                to="/admin/profile"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-white/70"
              >
                <Users className="h-4 w-4" /> My Profile
              </Link>
              <Link
                to="/admin/notifications"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-white/70"
              >
                <Bell className="h-4 w-4" /> Notifications
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className={cn("relative z-10 px-4 py-6 sm:px-6 lg:py-8 lg:pr-6", mainPad)}>
        {/* Desktop top utility bar (notifications) */}
        <div className="mb-4 hidden items-center justify-end gap-2 lg:flex">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-[1500px]">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarGroup({
  group,
  collapsed,
  isActive,
  groupActive,
}: {
  group: GroupItem;
  collapsed: boolean;
  isActive: (p: string) => boolean;
  groupActive: boolean;
}) {
  const [open, setOpen] = useState(groupActive);
  const [hoverOpen, setHoverOpen] = useState(false);
  const Icon = group.icon;

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  const itemBase =
    "group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px] font-semibold transition-all";
  const itemIdle = "text-foreground/75 hover:bg-accent/10 hover:text-accent";
  const itemActive =
    "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)] shadow-[0_2px_8px_-2px_color-mix(in_oklab,var(--accent)_25%,transparent)] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-accent";

  const iconSpanBase = "grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors";
  const iconSpanActive = "bg-accent text-accent-foreground shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--accent)_55%,transparent)]";
  const iconSpanIdle = "bg-white/70 text-foreground/70 group-hover:bg-accent/15 group-hover:text-accent";

  if (!group.children || group.children.length === 0) {
    return (
      <Link
        to={group.to!}
        title={collapsed ? group.label : undefined}
        className={cn(itemBase, groupActive ? itemActive : itemIdle, collapsed && "justify-center px-2")}
      >
        <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
          <Icon className="h-4 w-4" />
        </span>
        {!collapsed && <span className="truncate">{group.label}</span>}
      </Link>
    );
  }

  if (collapsed) {
    return (
      <CollapsedGroupPopover
        group={group}
        groupActive={groupActive}
        isActive={isActive}
        itemBase={itemBase}
        itemIdle={itemIdle}
        itemActive={itemActive}
        iconSpanBase={iconSpanBase}
        iconSpanIdle={iconSpanIdle}
        iconSpanActive={iconSpanActive}
        Icon={Icon}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(itemBase, groupActive ? itemActive : itemIdle)}
      >
        <span className={cn(iconSpanBase, groupActive ? iconSpanActive : iconSpanIdle)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-60 transition-transform", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 ml-4 space-y-0.5 border-l border-white/60 pl-3">
          {group.children.map((c) => {
            const a = isActive(c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                search={c.search as never}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                  a
                    ? "bg-[color-mix(in_oklab,var(--accent)_10%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
                    : "text-foreground/70 hover:bg-accent/10 hover:text-accent",
                )}
              >
                <c.icon className="h-3.5 w-3.5 opacity-80" />
                <span className="truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
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
          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
          isGroupActive
            ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
            : "text-foreground hover:bg-accent/10 hover:text-accent",
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
          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
          isGroupActive
            ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
            : "text-foreground hover:bg-accent/10 hover:text-accent",
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
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  a
                    ? "bg-[color-mix(in_oklab,var(--accent)_10%,white)] text-accent ring-1 ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
                    : "text-foreground/80 hover:bg-accent/10 hover:text-accent",
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
