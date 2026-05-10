import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Edit2, ExternalLink, List as ListIcon, MapPin, Network, Plus, Search, Trash2, Users, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  nextCustomerCode,
  useCustomers,
  useUnits,
  useBranches,
  useStates,
  type Customer,
  type CustomerStatus,
  type Unit,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/customers/customer-manager")({
  component: CustomerManagerPage,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function CustomerManagerPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useCustomers();

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [viewingUnits, setViewingUnits] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const list = [...customers].sort((a, b) => {
      const na = parseInt(a.code.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.code.replace(/\D/g, ""), 10) || 0;
      return na - nb;
    });
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.website.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const activeCount = customers.filter((c) => c.status === "active").length;

  return (
    <div>
      <PageHeader
        title="Customer Manager"
        description="Onboard organisations and manage their contract details."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "Customer Manager" },
        ]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total customers" value={customers.length} />
        <StatCard label="Active" value={activeCount} accent />
        <StatCard label="Inactive" value={customers.length - activeCount} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, name, website, phone, address…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add customer
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Org ID</th>
                <th className="px-5 py-3">Organisation</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Contract start</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-accent">
                    {c.code}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-foreground">{c.name}</div>
                    {c.address && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {c.address}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.website ? (
                      <a
                        href={normaliseUrl(c.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-foreground hover:text-accent"
                      >
                        {c.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="italic opacity-60">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-foreground">
                    {c.phone || <span className="italic opacity-60">—</span>}
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    {formatDate(c.contractStartDate)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-accent"
                        onClick={() => setViewingUnits(c)}
                        aria-label="View units"
                        title="View mapped units"
                      >
                        <Network className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditing(c);
                          setFormOpen(true);
                        }}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(c)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm text-muted-foreground"
                  >
                    <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    {customers.length === 0
                      ? "No customers yet. Add your first organisation to get started."
                      : "No customers match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={async (data) => {
          const r = editing ? await updateCustomer(editing.id, data) : await addCustomer(data);
          if (!r.ok) return r.error;
          toast.success(editing ? "Customer updated" : "Customer added");
          return null;
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-semibold text-foreground">{deleting?.name}</span>{" "}
              (
              <span className="font-mono text-foreground">{deleting?.code}</span>
              ) from the directory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteCustomer(deleting.id);
                  toast.success("Customer deleted");
                  setDeleting(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerUnitsDialog
        customer={viewingUnits}
        onOpenChange={(o) => !o && setViewingUnits(null)}
      />
    </div>
  );
}

function CustomerUnitsDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { units, updateUnit } = useUnits();
  const { branches } = useBranches();
  const { states } = useStates();
  const [view, setView] = useState<"list" | "tree">("list");

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const orgUnits = useMemo(() => {
    if (!customer) return [];
    return units
      .filter((u) => u.customerId === customer.id)
      .sort((a, b) => {
        const na = parseInt(a.code.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.code.replace(/\D/g, ""), 10) || 0;
        return na - nb;
      });
  }, [units, customer]);

  const branchLabel = (u: Unit) => {
    if (!u.branchId) return "—";
    const b = branchById.get(u.branchId);
    if (!b) return "—";
    const st = stateById.get(b.stateId)?.name ?? "";
    return `${b.code} – ${st}`;
  };

  const toggleStatus = async (u: Unit) => {
    const next = u.status === "active" ? "inactive" : "active";
    const { id: _id, ...rest } = u;
    void _id;
    const r = await updateUnit(u.id, { ...rest, status: next });
    if (r.ok) toast.success(`${u.code} marked ${next}`);
    else toast.error(r.error);
  };

  return (
    <Dialog open={!!customer} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            {customer?.name}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{customer?.code}</span>
            {customer?.address ? <> · {customer.address}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {orgUnits.length} unit{orgUnits.length === 1 ? "" : "s"} mapped
          </div>
          <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
                view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <ListIcon className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("tree")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
                view === "tree" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Network className="h-3.5 w-3.5" /> Tree
            </button>
          </div>
        </div>

        {orgUnits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <Warehouse className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No units mapped to this organisation yet.
          </div>
        ) : view === "list" ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orgUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs font-semibold text-accent">{u.code}</div>
                      <div className="font-semibold text-foreground">{u.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{branchLabel(u)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-1">{u.location || "—"}</span>
                        {u.latitude != null && u.longitude != null && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent hover:bg-accent/10"
                            title="Open in Google Maps"
                          >
                            <MapPin className="h-3 w-3" /> Map
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={u.status === "active"}
                        onCheckedChange={() => toggleStatus(u)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-accent" />
              {customer?.name}
              <span className="font-mono text-xs text-muted-foreground">({customer?.code})</span>
            </div>
            <ul className="mt-2 space-y-1.5 border-l-2 border-dashed border-border pl-4">
              {orgUnits.map((u) => (
                <li
                  key={u.id}
                  className="relative flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Warehouse className="h-4 w-4 text-accent" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-accent">{u.code}</span>
                      <span className="font-semibold text-foreground">{u.name}</span>
                      <StatusBadge status={u.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {branchLabel(u)} · {u.location || "—"}
                    </div>
                  </div>
                  {u.latitude != null && u.longitude != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
                    >
                      <MapPin className="h-3 w-3" /> Map
                    </a>
                  )}
                  <Switch
                    checked={u.status === "active"}
                    onCheckedChange={() => toggleStatus(u)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function normaliseUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        status === "active"
          ? "bg-accent/15 text-accent"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "active" ? "bg-accent" : "bg-muted-foreground",
        )}
      />
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-display text-3xl font-bold",
          accent ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Customer | null;
  onSubmit: (data: Omit<Customer, "id">) => Promise<string | null> | string | null;
}) {
  const { customers } = useCustomers();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [contractStartDate, setContractStartDate] = useState(todayIso());
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCode(editing.code);
      setName(editing.name);
      setWebsite(editing.website);
      setPhone(editing.phone);
      setAddress(editing.address);
      setContractStartDate(editing.contractStartDate || todayIso());
      setActive(editing.status === "active");
    } else {
      setCode(nextCustomerCode(customers));
      setName("");
      setWebsite("");
      setPhone("");
      setAddress("");
      setContractStartDate(todayIso());
      setActive(true);
    }
    setError(null);
  }, [open, editing, customers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            Each customer gets a unique organisation ID for internal mapping.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const err = await onSubmit({
              code,
              name,
              website,
              phone,
              address,
              contractStartDate,
              status: active ? "active" : "inactive",
            });
            if (err) setError(err);
            else onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-code">Organisation ID</Label>
              <Input
                id="org-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="ORG1"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-name">Organisation name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="Acme Industries Pvt Ltd"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-website">Website</Label>
              <Input
                id="org-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="acme.com"
                type="text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-phone">Phone number</Label>
              <Input
                id="org-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                inputMode="tel"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="org-address">Address</Label>
              <Textarea
                id="org-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, city, state, pincode"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-date">Contract start date</Label>
              <Input
                id="org-date"
                type="date"
                value={contractStartDate}
                onChange={(e) => setContractStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3">
                <span className="text-sm font-medium text-foreground">
                  {active ? "Active" : "Inactive"}
                </span>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </div>
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {editing ? "Save changes" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
