import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Edit2, ExternalLink, List as ListIcon, MapPin, Network, Plus, Search, Trash2, Users, Warehouse } from "lucide-react";
import { DeleteGuardButton } from "@/components/DeleteGuardButton";
import { csvDate, csvStatus, downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { logActivity } from "@/lib/activity-log";
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
  INDUSTRY_TYPES,
  nextCustomerCode,
  useCustomers,
  useUnits,
  useBranches,
  useStates,
  type Customer,
  type CustomerStatus,
  type Unit,
} from "@/lib/admin-data";
import { supabase } from "@/integrations/supabase/client";
import { gstinStateCode, gstinStateName } from "@/lib/gstin";
import { cn } from "@/lib/utils";
import { UnitDeployedPeople } from "@/components/UnitDeployedPeople";

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
        title="Organization Manager"
        description="Onboard organisations and manage their contract details."
        crumbs={[
          { label: "Organizations", to: "/admin/customers" },
          { label: "Organization Manager" },
        ]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total organizations" value={customers.length} />
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "organizations",
                rows.map((c) => ({
                  orgId: c.code,
                  organisation: c.name,
                  website: c.website,
                  phone: c.phone,
                  address: c.address,
                  status: csvStatus(c.status),
                })),
                [
                  { key: "orgId", header: "Org ID" },
                  { key: "organisation", header: "Organisation" },
                  { key: "website", header: "Website" },
                  { key: "phone", header: "Phone" },
                  { key: "address", header: "Address" },
                  { key: "status", header: "Status" },
                ],
              )
            }
            disabled={rows.length === 0}
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add organization
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{rows.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total {rows.length === 1 ? "row" : "rows"}</span></span>
        </div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full table-fixed text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Org ID</th>
                <th className="px-5 py-3">Organisation</th>
                <th className="px-5 py-3">Website</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-accent">
                    {c.code}
                  </td>
                  <td className="px-5 py-3">
                    <div className="truncate font-semibold text-foreground">{c.name}</div>
                    {c.address && (
                      <div className="truncate text-xs text-muted-foreground">
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
                  <td className="px-5 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right" data-col="actions">
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
                      <DeleteGuardButton
                        id={c.id}
                        entityLabel="organization"
                        checks={[
                          { table: "units", column: "customer_id", label: "units" },
                          { table: "customer_gst_numbers", column: "customer_id", label: "GSTINs" },
                        ]}
                        onDelete={() => setDeleting(c)}
                      />

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
                      ? "No organizations yet. Add your first organization to get started."
                      : "No organizations match your search."}
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
          if (editing) {
            const r = await updateCustomer(editing.id, data);
            if (!r.ok) return { error: r.error, id: null };
            void logActivity({ module: "Organization Manager", action: "update", entityType: "customers", entityId: editing.id, entityLabel: String(data.name ?? ""), details: data as Record<string, unknown> });
            return { error: null, id: editing.id };
          }
          const r = await addCustomer(data);
          if (!r.ok) return { error: r.error, id: null };
          void logActivity({ module: "Organization Manager", action: "create", entityType: "customers", entityId: r.id, entityLabel: String(data.name ?? ""), details: data as Record<string, unknown> });
          return { error: null, id: r.id };
        }}
        onSuccess={() => {
          toast.success(editing ? "Organization updated" : "Organization added");
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
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
                  const _delId = deleting.id;
                  const _delLabel = String((deleting as Record<string, unknown>).name ?? (deleting as Record<string, unknown>).code ?? _delId);
                  await deleteCustomer(_delId);
                  void logActivity({ module: "Organization Manager", action: "delete", entityType: "customers", entityId: _delId, entityLabel: _delLabel });
                  toast.success("Organization deleted");
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
            <table className="ios-table w-full text-sm">
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
              {orgUnits.map((u) => {
                const stName = u.branchId
                  ? stateById.get(branchById.get(u.branchId)?.stateId ?? "")?.name ?? ""
                  : "";
                return (
                  <li
                    key={u.id}
                    className="relative rounded-lg border border-border bg-secondary/30 p-3"
                  >
                    <div className="flex items-center gap-3">
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
                    </div>
                    <div className="mt-2 ml-7 border-l-2 border-dashed border-border pl-3">
                      <UnitDeployedPeople
                        unitId={u.id}
                        branchId={u.branchId ?? null}
                        customerId={u.customerId ?? null}
                        stateName={stName}
                      />
                    </div>
                  </li>
                );
              })}
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
                            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
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

type GstEntry = { id?: string; gstin: string; label: string };

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Customer | null;
  onSubmit: (
    data: Omit<Customer, "id">,
  ) => Promise<{ error: string | null; id: string | null }>;
  onSuccess: () => void;
}) {
  const { customers } = useCustomers();
  const [form, setForm] = useState<Omit<Customer, "id">>(emptyCustomer());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting2, setSubmitting2] = useState(false); void submitting2;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      setForm(rest);
      // load existing GST numbers for this organisation
      void (async () => {
        const { data } = await supabase
          .from("customer_gst_numbers" as never)
          .select("id,gstin,label")
          .eq("customer_id", editing.id);
        const rows = ((data ?? []) as unknown) as Array<{ id: string; gstin: string; label: string }>;
        setGstEntries(rows.map((r) => ({ id: r.id, gstin: r.gstin, label: r.label ?? "" })));
      })();
    } else {
      setForm({ ...emptyCustomer(), code: nextCustomerCode(customers) });
      setGstEntries([]);
    }
    setError(null);
  }, [open, editing, customers]);

  const set = <K extends keyof Omit<Customer, "id">>(key: K, value: Omit<Customer, "id">[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const handleLogo = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${form.code || "ORG"}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("org-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
      set("logoUrl", data.publicUrl);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const billingFields: Array<{ key: keyof Omit<Customer, "id">; label: string; placeholder?: string; full?: boolean }> = [
    { key: "billingSalutation", label: "Salutation", placeholder: "Mr. / Ms. / Dr." },
    { key: "billingName", label: "Name" },
    { key: "billingAddress1", label: "Address line 1", full: true },
    { key: "billingAddress2", label: "Address line 2", full: true },
    { key: "billingPincode", label: "Pincode" },
    { key: "billingCity", label: "City" },
    { key: "billingDistrict", label: "District" },
    { key: "billingState", label: "State" },
    { key: "billingCountry", label: "Country" },
    { key: "billingEmail", label: "Email" },
    { key: "billingPhone", label: "Phone" },
    { key: "billingFax", label: "Fax" },
  ];
  const shippingFields = billingFields.map((f) => ({
    ...f,
    key: f.key.toString().replace("billing", "shipping") as keyof Omit<Customer, "id">,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit organization" : "Add organization"}</DialogTitle>
          <DialogDescription>
            Capture the organisation profile, contract window, and billing/shipping addresses.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // basic GST validation: skip blanks, enforce length-15 if filled
            const cleaned = gstEntries
              .map((g) => ({ ...g, gstin: g.gstin.trim().toUpperCase() }))
              .filter((g) => g.gstin.length > 0);
            if (cleaned.some((g) => g.gstin.length !== 15)) {
              setError("Each GSTIN must be 15 characters long");
              return;
            }
            setSubmitting(true);
            try {
              const result = await onSubmit(form);
              if (result.error) {
                setError(result.error);
                return;
              }
              const customerId = result.id;
              if (customerId) {
                // wipe and rewrite GST records (simple, predictable)
                await supabase
                  .from("customer_gst_numbers" as never)
                  .delete()
                  .eq("customer_id", customerId);
                if (cleaned.length > 0) {
                  const rows = cleaned.map((g) => ({
                    customer_id: customerId,
                    gstin: g.gstin,
                    state_code: gstinStateCode(g.gstin),
                    state_name: gstinStateName(g.gstin),
                    label: g.label.trim(),
                  }));
                  const { error: gstErr } = await supabase
                    .from("customer_gst_numbers" as never)
                    .insert(rows as never);
                  if (gstErr) {
                    setError(`Saved org but GST save failed: ${gstErr.message}`);
                    return;
                  }
                }
              }
              onSuccess();
              onOpenChange(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-6"
        >
          <SectionHeading title="Organization profile" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation ID">
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="ORG1"
                className="font-mono"
              />
            </Field>
            <Field label="Organisation name">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Acme Industries Pvt Ltd"
                autoFocus
              />
            </Field>
            <Field label="Short name">
              <Input
                value={form.shortName}
                onChange={(e) => set("shortName", e.target.value)}
                placeholder="Acme"
              />
            </Field>
            <Field label="Industry / Organization type">
              <select
                value={form.industryType}
                onChange={(e) => set("industryType", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select industry…</option>
                {INDUSTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" full>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Brief overview of the organisation"
                rows={2}
              />
            </Field>
            <Field label="Logo" full>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Logo"
                    className="h-12 w-12 rounded-md border border-border bg-card object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    Logo
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogo(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="max-w-xs"
                />
                {form.logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set("logoUrl", "")}
                    className="text-muted-foreground"
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Website">
              <Input
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="acme.com"
              />
            </Field>
            <Field label="Status">
              <div className="flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3">
                <span className="text-sm font-medium text-foreground">
                  {form.status === "active" ? "Active" : "Inactive"}
                </span>
                <Switch
                  checked={form.status === "active"}
                  onCheckedChange={(v) => set("status", v ? "active" : "inactive")}
                />
              </div>
            </Field>
          </div>


          <SectionHeading title="Billing information" />
          <div className="grid gap-4 sm:grid-cols-2">
            {billingFields.map((f) => {
              const isPincode = f.key === "billingPincode";
              const isPhone = f.key === "billingPhone" || f.key === "billingFax";
              return (
                <Field key={f.key} label={f.label} full={f.full}>
                  <Input
                    value={(form[f.key] as string) ?? ""}
                    onChange={(e) => {
                      let v = e.target.value;
                      if (isPincode) v = v.replace(/\D/g, "").slice(0, 6);
                      else if (isPhone) v = v.replace(/\D/g, "").slice(0, 10);
                      set(f.key, v as never);
                    }}
                    placeholder={f.placeholder ?? (isPincode ? "6-digit pincode" : isPhone ? "10-digit number" : undefined)}
                    inputMode={isPincode || isPhone ? "numeric" : undefined}
                    maxLength={isPincode ? 6 : isPhone ? 10 : undefined}
                  />
                </Field>
              );
            })}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
              <SectionHeading title="Shipping information" inline />
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Same as billing
                <Switch
                  checked={form.shippingSameAsBilling}
                  onCheckedChange={(v) => set("shippingSameAsBilling", v)}
                />
              </label>
            </div>
            {!form.shippingSameAsBilling && (
              <div className="grid gap-4 sm:grid-cols-2">
                {shippingFields.map((f) => {
                  const isPincode = f.key === "shippingPincode";
                  const isPhone = f.key === "shippingPhone" || f.key === "shippingFax";
                  return (
                    <Field key={f.key} label={f.label} full={f.full}>
                      <Input
                        value={(form[f.key] as string) ?? ""}
                        onChange={(e) => {
                          let v = e.target.value;
                          if (isPincode) v = v.replace(/\D/g, "").slice(0, 6);
                          else if (isPhone) v = v.replace(/\D/g, "").slice(0, 10);
                          set(f.key, v as never);
                        }}
                        placeholder={f.placeholder ?? (isPincode ? "6-digit pincode" : isPhone ? "10-digit number" : undefined)}
                        inputMode={isPincode || isPhone ? "numeric" : undefined}
                        maxLength={isPincode ? 6 : isPhone ? 10 : undefined}
                      />
                    </Field>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {submitting ? "Saving…" : editing ? "Save changes" : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyCustomer(): Omit<Customer, "id"> {
  return {
    code: "",
    name: "",
    shortName: "",
    description: "",
    logoUrl: "",
    industryType: "",
    website: "",
    phone: "",
    address: "",
    contractStartDate: todayIso(),
    contractEndDate: "",
    status: "active",
    billingSalutation: "",
    billingName: "",
    billingAddress1: "",
    billingAddress2: "",
    billingPincode: "",
    billingCity: "",
    billingDistrict: "",
    billingState: "",
    billingCountry: "India",
    billingEmail: "",
    billingPhone: "",
    billingFax: "",
    shippingSameAsBilling: true,
    shippingSalutation: "",
    shippingName: "",
    shippingAddress1: "",
    shippingAddress2: "",
    shippingPincode: "",
    shippingCity: "",
    shippingDistrict: "",
    shippingState: "",
    shippingCountry: "India",
    shippingEmail: "",
    shippingPhone: "",
    shippingFax: "",
  };
}

function SectionHeading({ title, inline }: { title: string; inline?: boolean }) {
  return (
    <h3
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground",
        !inline && "border-b border-border pb-2",
      )}
    >
      {title}
    </h3>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("space-y-2", full && "sm:col-span-2")}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
