import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  ExternalLink,
  MapPin,
  Network,
  Search,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBranches,
  useCustomers,
  useStates,
  useUnits,
  type Customer,
  type CustomerStatus,
  type Unit,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersLayout,
});

function CustomersLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname !== "/admin/customers" && pathname !== "/admin/customers/") {
    return <Outlet />;
  }

  return <CustomersDashboard />;
}

function CustomersDashboard() {
  const { customers } = useCustomers();
  const { units } = useUnits();
  const { branches } = useBranches();
  const { states } = useStates();

  const [query, setQuery] = useState("");
  const [stateId, setStateId] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [treeOpen, setTreeOpen] = useState(false);

  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const branchLabel = (u: Unit) => {
    if (!u.branchId) return "—";
    const b = branchById.get(u.branchId);
    if (!b) return "—";
    const st = stateById.get(b.stateId)?.name ?? "";
    return `${b.code} – ${st}`;
  };

  const filteredBranches = useMemo(() => {
    if (stateId === "all") return branches;
    return branches.filter((b) => b.stateId === stateId);
  }, [branches, stateId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units
      .filter((u) => {
        const c = u.customerId ? customerById.get(u.customerId) : undefined;
        const b = u.branchId ? branchById.get(u.branchId) : undefined;
        if (status !== "all" && u.status !== status) return false;
        if (branchId !== "all" && u.branchId !== branchId) return false;
        if (stateId !== "all" && b?.stateId !== stateId) return false;
        if (!q) return true;
        return (
          u.code.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          u.location.toLowerCase().includes(q) ||
          (c?.name.toLowerCase().includes(q) ?? false) ||
          (c?.code.toLowerCase().includes(q) ?? false) ||
          (b?.code.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        const ca = a.customerId ? customerById.get(a.customerId)?.name ?? "" : "";
        const cb = b.customerId ? customerById.get(b.customerId)?.name ?? "" : "";
        return ca.localeCompare(cb) || a.code.localeCompare(b.code);
      });
  }, [units, query, status, branchId, stateId, customerById, branchById]);

  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const activeUnits = units.filter((u) => u.status === "active").length;

  const clearFilters = () => {
    setQuery("");
    setStateId("all");
    setBranchId("all");
    setStatus("all");
  };

  const hasFilters = !!query || stateId !== "all" || branchId !== "all" || status !== "all";

  return (
    <div>
      <PageHeader
        title="Customers Dashboard"
        description="Live overview of customers, branches and operational units across India."
        crumbs={[{ label: "Customers" }]}
      />

      {/* Stat tiles */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Customers"
          value={customers.length}
          sub={`${activeCustomers} active`}
          icon={Users}
          to="/admin/customers/customer-manager"
          accent
        />
        <StatTile
          label="Units"
          value={units.length}
          sub={`${activeUnits} active`}
          icon={Warehouse}
          to="/admin/customers/unit-manager"
        />
        <StatTile
          label="Branches"
          value={branches.length}
          sub={`${states.length} states`}
          icon={Building2}
          to="/admin/customers/branch-manager"
        />
        <StatTile
          label="States"
          value={states.length}
          sub="across India"
          icon={MapPin}
          to="/admin/customers/state-manager"
        />
      </div>

      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          className="h-10 rounded-lg border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
          onClick={() => setTreeOpen(true)}
        >
          <Network className="mr-1.5 h-4 w-4" />
          View full hierarchy
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,180px))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer, unit, code, location…"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Select value={stateId} onValueChange={(v) => { setStateId(v); setBranchId("all"); }}>
            <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {states.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {filteredBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.code} – {stateById.get(b.stateId)?.name ?? ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-10 rounded-lg"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{rows.length}</span> of {units.length} units
        </div>
      </div>

      {/* Combined customer + unit list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Branch / Location</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => {
                const c = u.customerId ? customerById.get(u.customerId) : undefined;
                return (
                  <tr key={u.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3">
                      {c ? (
                        <>
                          <div className="font-mono text-[11px] font-semibold text-accent">{c.code}</div>
                          <div className="font-semibold text-foreground">{c.name}</div>
                          {c.website && (
                            <a
                              href={normaliseUrl(c.website)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-accent"
                            >
                              {c.website} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-mono text-[11px] font-semibold text-accent">{u.code}</div>
                      <div className="font-semibold text-foreground">{u.name}</div>
                      {u.gstNumber && (
                        <div className="text-[11px] text-muted-foreground font-mono">GST {u.gstNumber}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">{branchLabel(u)}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{u.location || "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {u.emergencyContactName ? (
                        <>
                          <div className="text-foreground">{u.emergencyContactName}</div>
                          <div className="font-mono text-muted-foreground">{u.emergencyContactMobile || "—"}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {u.latitude != null && u.longitude != null ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
                        >
                          <MapPin className="h-3 w-3" /> Map
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    <Warehouse className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    No units match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <HierarchyTreeDialog
        open={treeOpen}
        onOpenChange={setTreeOpen}
        states={states}
        branches={branches}
        units={units}
        customerById={customerById}
      />
    </div>
  );
}

function HierarchyTreeDialog({
  open,
  onOpenChange,
  states,
  branches,
  units,
  customerById,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  states: { id: string; name: string }[];
  branches: { id: string; code: string; name: string; stateId: string }[];
  units: Unit[];
  customerById: Map<string, Customer>;
}) {
  const tree = useMemo(() => {
    const branchUnits = new Map<string, Unit[]>();
    for (const u of units) {
      if (!u.branchId) continue;
      const arr = branchUnits.get(u.branchId) ?? [];
      arr.push(u);
      branchUnits.set(u.branchId, arr);
    }
    return [...states]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => {
        const stBranches = branches
          .filter((b) => b.stateId === s.id)
          .map((b) => ({
            ...b,
            units: (branchUnits.get(b.id) ?? []).sort((x, y) => x.code.localeCompare(y.code)),
          }))
          .filter((b) => b.units.length > 0)
          .sort((a, b) => a.code.localeCompare(b.code));
        return { state: s, branches: stBranches };
      })
      .filter((s) => s.branches.length > 0);
  }, [states, branches, units]);

  const totalBranches = tree.reduce((n, s) => n + s.branches.length, 0);
  const totalUnits = tree.reduce(
    (n, s) => n + s.branches.reduce((m, b) => m + b.units.length, 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-accent" />
            States → Branches → Units
          </DialogTitle>
          <DialogDescription>
            {tree.length} active states · {totalBranches} mapped branches · {totalUnits} units
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {tree.map(({ state, branches: br }) => (
            <div key={state.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                <span className="font-semibold text-foreground">{state.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {br.length} branch{br.length === 1 ? "" : "es"}
                </span>
              </div>
              <ul className="mt-2 space-y-2 border-l-2 border-dashed border-border pl-4">
                {br.map((b) => (
                  <li key={b.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-accent" />
                      <span className="font-mono text-[11px] font-semibold text-accent">{b.code}</span>
                      <span className="font-semibold text-foreground">{b.name || "—"}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {b.units.length} unit{b.units.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1.5 border-l-2 border-dashed border-border pl-4">
                      {b.units.map((u) => {
                        const c = u.customerId ? customerById.get(u.customerId) : undefined;
                        return (
                          <li
                            key={u.id}
                            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-2.5"
                          >
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            <Warehouse className="h-4 w-4 text-accent" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-accent">{u.code}</span>
                                <span className="truncate font-semibold text-foreground">{u.name}</span>
                                <StatusBadge status={u.status} />
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {c ? (
                                  <>
                                    <span className="text-foreground">{c.name}</span>
                                    <span className="font-mono"> ({c.code})</span> ·{" "}
                                  </>
                                ) : null}
                                {u.location || "—"}
                              </div>
                            </div>
                            {u.latitude != null && u.longitude != null && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
                              >
                                <MapPin className="h-3 w-3" /> Map
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {tree.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No mapped states with units yet.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  to,
  accent,
  onCount,
  countTitle,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  accent?: boolean;
  onCount?: () => void;
  countTitle?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--accent)_30%,transparent)]",
        accent ? "border-accent/40" : "border-border hover:border-accent/40",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {onCount ? (
        <button
          type="button"
          onClick={onCount}
          title={countTitle}
          className="mt-2 block text-left font-display text-3xl font-bold text-foreground transition-colors hover:text-accent"
        >
          {value}
        </button>
      ) : (
        <div className="mt-2 font-display text-3xl font-bold text-foreground">{value}</div>
      )}
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{sub}</span>
        <Link
          to={to}
          className="font-semibold text-accent opacity-70 transition-opacity hover:opacity-100"
        >
          Manage →
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status === "active" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-accent" : "bg-muted-foreground")} />
      {status}
    </span>
  );
}

function normaliseUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
