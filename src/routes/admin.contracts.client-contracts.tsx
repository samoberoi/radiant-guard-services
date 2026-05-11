import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Copy,
  Download,
  Edit2,
  FileText,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { csvDate, downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCustomers, useUnits } from "@/lib/admin-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/contracts/client-contracts")({
  component: ClientContractsPage,
});

type GstOption = "csgst" | "igst" | "none";
type ContractStatus = "active" | "inactive" | "expired";

type ClientContract = {
  id: string;
  contractCode: string;
  unitId: string;
  startDate: string;
  endDate: string;
  description: string;
  serviceTypeId: string | null;
  payrollWindowId: string | null;
  billingTypeId: string | null;
  gstOption: GstOption;
  status: ContractStatus;
};

type ServiceType = { id: string; name: string };
type PayrollWindow = {
  id: string;
  label: string;
  windowStartDay: number;
  windowEndDay: number;
  processingDay: number;
};
type BillingType = { id: string; name: string };
type Designation = { id: string; name: string; code: string };
type AllowanceType = {
  id: string;
  name: string;
  displayName: string;
  shortName: string;
  isDefault: boolean;
};

type ResourceComponent = {
  allowanceId: string;
  name: string;
  amount: number;
};

type ContractResource = {
  id?: string;
  designationId: string;
  serviceTypeId: string;
  quantity: number;
  components: ResourceComponent[];
};

const QK = ["admin", "client-contracts"] as const;
const QK_SVC = ["admin", "service-types", "enabled"] as const;
const QK_PAY = ["admin", "payroll-windows", "enabled"] as const;
const QK_BIL = ["admin", "billing-types", "enabled"] as const;
const QK_DSG = ["admin", "designations", "enabled"] as const;
const QK_ALW = ["admin", "allowance-types", "enabled"] as const;

function rowToContract(r: Record<string, unknown>): ClientContract {
  return {
    id: String(r.id),
    contractCode: String(r.contract_code ?? ""),
    unitId: String(r.unit_id ?? ""),
    startDate: r.start_date ? String(r.start_date) : "",
    endDate: r.end_date ? String(r.end_date) : "",
    description: String(r.description ?? ""),
    serviceTypeId: r.service_type_id ? String(r.service_type_id) : null,
    payrollWindowId: r.payroll_window_id ? String(r.payroll_window_id) : null,
    billingTypeId: r.billing_type_id ? String(r.billing_type_id) : null,
    gstOption: (r.gst_option as GstOption) ?? "csgst",
    status: (r.status as ContractStatus) ?? "active",
  };
}

function nextContractCode(existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = code.match(/CON(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CON${String(max + 1).padStart(5, "0")}`;
}

function useContracts() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<ClientContract[]> => {
      const { data, error } = await supabase
        .from("client_contracts" as never)
        .select(
          "id,contract_code,unit_id,start_date,end_date,description,service_type_id,payroll_window_id,billing_type_id,gst_option,status",
        )
        .order("contract_code", { ascending: false });
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map(rowToContract);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  type Payload = Omit<ClientContract, "id">;
  const toRow = (p: Payload) => ({
    contract_code: p.contractCode,
    unit_id: p.unitId,
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    description: p.description.trim(),
    service_type_id: p.serviceTypeId,
    payroll_window_id: p.payrollWindowId,
    billing_type_id: p.billingTypeId,
    gst_option: p.gstOption,
    status: p.status,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload): Promise<string> => {
      if (!p.unitId) throw new Error("Unit is required");
      const { data, error } = await supabase
        .from("client_contracts" as never)
        .insert(toRow(p) as never)
        .select("id")
        .single();
      if (error) throw error;
      return String((data as Record<string, unknown>).id);
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase
        .from("client_contracts" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_contracts" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, deleteMut };
}

function useServiceTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_SVC,
    queryFn: async (): Promise<ServiceType[]> => {
      const { data, error } = await supabase
        .from("service_types" as never)
        .select("id,name,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
  return data;
}

function usePayrollWindows() {
  const { data = [] } = useQuery({
    queryKey: QK_PAY,
    queryFn: async (): Promise<PayrollWindow[]> => {
      const { data, error } = await supabase
        .from("payroll_windows" as never)
        .select("id,label,window_start_day,window_end_day,processing_day,enabled")
        .order("window_start_day");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          label: String(r.label),
          windowStartDay: Number(r.window_start_day),
          windowEndDay: Number(r.window_end_day),
          processingDay: Number(r.processing_day),
        }));
    },
  });
  return data;
}

function useBillingTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_BIL,
    queryFn: async (): Promise<BillingType[]> => {
      const { data, error } = await supabase
        .from("billing_types" as never)
        .select("id,name,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: String(r.id), name: String(r.name) }));
    },
  });
  return data;
}

function useDesignations() {
  const { data = [] } = useQuery({
    queryKey: QK_DSG,
    queryFn: async (): Promise<Designation[]> => {
      const { data, error } = await supabase
        .from("designations" as never)
        .select("id,name,code,enabled")
        .order("name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          code: String(r.code ?? ""),
        }));
    },
  });
  return data;
}

function useAllowanceTypes() {
  const { data = [] } = useQuery({
    queryKey: QK_ALW,
    queryFn: async (): Promise<AllowanceType[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,display_name,short_name,is_default,enabled")
        .order("display_name");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          displayName: String(r.display_name ?? r.name),
          shortName: String(r.short_name ?? ""),
          isDefault: Boolean(r.is_default),
        }));
    },
  });
  return data;
}

function useContractResources(contractId: string | null) {
  const { data = [] } = useQuery({
    queryKey: ["admin", "contract-resources", contractId ?? "none"],
    enabled: !!contractId,
    queryFn: async (): Promise<ContractResource[]> => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from("contract_resources" as never)
        .select("id,designation_id,service_type_id,quantity,components,sort_order")
        .eq("contract_id", contractId)
        .order("sort_order");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        designationId: r.designation_id ? String(r.designation_id) : "",
        serviceTypeId: r.service_type_id ? String(r.service_type_id) : "",
        quantity: Number(r.quantity ?? 1),
        components: Array.isArray(r.components)
          ? (r.components as ResourceComponent[])
          : [],
      }));
    },
  });
  return data;
}

async function persistResources(contractId: string, resources: ContractResource[]) {
  const del = await supabase
    .from("contract_resources" as never)
    .delete()
    .eq("contract_id", contractId);
  if (del.error) throw del.error;
  if (resources.length === 0) return;
  const rows = resources.map((r, idx) => ({
    contract_id: contractId,
    designation_id: r.designationId || null,
    service_type_id: r.serviceTypeId || null,
    quantity: r.quantity,
    components: r.components,
    gross: r.components.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    sort_order: idx,
  }));
  const ins = await supabase.from("contract_resources" as never).insert(rows as never);
  if (ins.error) throw ins.error;
}

function ClientContractsPage() {
  const { items, addMut, updateMut, deleteMut } = useContracts();
  const { units } = useUnits();
  const { customers } = useCustomers();

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContract | null>(null);
  const [deleting, setDeleting] = useState<ClientContract | null>(null);

  const enriched = useMemo(() => {
    return items.map((c) => {
      const unit = unitById.get(c.unitId);
      const org = unit?.customerId ? customerById.get(unit.customerId) : undefined;
      return {
        ...c,
        unitName: unit?.name ?? "—",
        unitCode: unit?.code ?? "",
        orgName: org?.name ?? "—",
        orgId: org?.id ?? "",
      };
    });
  }, [items, unitById, customerById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (orgFilter !== "all" && c.orgId !== orgFilter) return false;
      if (unitFilter !== "all" && c.unitId !== unitFilter) return false;
      if (!q) return true;
      return (
        c.contractCode.toLowerCase().includes(q) ||
        c.unitName.toLowerCase().includes(q) ||
        c.unitCode.toLowerCase().includes(q) ||
        c.orgName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [enriched, query, statusFilter, orgFilter, unitFilter]);

  const hasFilters =
    !!query || orgFilter !== "all" || unitFilter !== "all" || statusFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Client Contracts"
        description="Manage client contracts across organisations and units."
        crumbs={[{ label: "Contracts" }, { label: "Client Contracts" }]}
      />

      <div className="mb-4 flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv(
              "client-contracts",
              filtered.map((c) => ({
                code: c.contractCode,
                organization: c.orgName,
                unit: `${c.unitCode} – ${c.unitName}`,
                start: csvDate(c.startDate),
                end: csvDate(c.endDate),
                description: c.description,
                gst: c.gstOption.toUpperCase(),
                status: c.status,
              })),
              [
                { key: "code", header: "Contract ID" },
                { key: "organization", header: "Organization" },
                { key: "unit", header: "Unit" },
                { key: "start", header: "Start date" },
                { key: "end", header: "End date" },
                { key: "description", header: "Description" },
                { key: "gst", header: "GST option" },
                { key: "status", header: "Status" },
              ],
            )
          }
          className="h-10 rounded-lg"
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export Contracts
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create Contract
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,200px))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by contract ID, unit, organisation…"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Select
            value={orgFilter}
            onValueChange={(v) => {
              setOrgFilter(v);
              setUnitFilter("all");
            }}
          >
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All organizations</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {units
                .filter((u) => orgFilter === "all" || u.customerId === orgFilter)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} – {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-10 rounded-lg"
            disabled={!hasFilters}
            onClick={() => {
              setQuery("");
              setOrgFilter("all");
              setUnitFilter("all");
              setStatusFilter("all");
            }}
          >
            <X className="mr-1.5 h-4 w-4" /> Clear
          </Button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {items.length} contracts
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Contract ID</th>
                <th className="px-5 py-3">Organization</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Start</th>
                <th className="px-5 py-3">End</th>
                <th className="px-5 py-3">GST</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-accent">
                    {c.contractCode}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">{c.orgName}</td>
                  <td className="px-5 py-3 text-foreground">
                    <div className="font-mono text-[11px] text-muted-foreground">{c.unitCode}</div>
                    <div>{c.unitName}</div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.startDate || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.endDate || "—"}</td>
                  <td className="px-5 py-3 text-xs uppercase tracking-wider text-foreground">
                    {c.gstOption === "none" ? "No GST" : c.gstOption}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    {items.length === 0
                      ? "No contracts yet. Create your first contract to get started."
                      : "No contracts match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ContractFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        existingCodes={items.map((i) => i.contractCode)}
        onSubmit={async (p, resources) => {
          try {
            let contractId: string;
            if (editing) {
              await updateMut.mutateAsync({ id: editing.id, p });
              contractId = editing.id;
            } else {
              contractId = await addMut.mutateAsync(p);
            }
            await persistResources(contractId, resources);
            toast.success(editing ? "Contract updated" : "Contract created");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not save contract";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <span className="font-mono font-semibold text-foreground">
                  {deleting.contractCode}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteMut.mutateAsync(deleting.id);
                  toast.success("Contract deleted");
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
    </div>
  );
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const map: Record<ContractStatus, string> = {
    active: "bg-accent/15 text-accent",
    inactive: "bg-muted text-muted-foreground",
    expired: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        map[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function ContractFormDialog({
  open,
  onOpenChange,
  editing,
  existingCodes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ClientContract | null;
  existingCodes: string[];
  onSubmit: (
    p: Omit<ClientContract, "id">,
    resources: ContractResource[],
  ) => Promise<string | null>;
}) {
  const { units } = useUnits();
  const { customers } = useCustomers();
  const serviceTypes = useServiceTypes();
  const payrollWindows = usePayrollWindows();
  const billingTypes = useBillingTypes();

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  const [contractCode, setContractCode] = useState("");
  const [unitId, setUnitId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState<string>("");
  const [payrollWindowId, setPayrollWindowId] = useState<string>("");
  const [billingTypeId, setBillingTypeId] = useState<string>("");
  const [gstOption, setGstOption] = useState<GstOption>("csgst");
  const [status, setStatus] = useState<ContractStatus>("active");
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<ContractResource[]>([]);
  const [resourceDialog, setResourceDialog] = useState<{
    open: boolean;
    index: number | null;
    initial: ContractResource | null;
  }>({ open: false, index: null, initial: null });

  const existingResources = useContractResources(editing?.id ?? null);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setContractCode(editing.contractCode);
      setUnitId(editing.unitId);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setDescription(editing.description);
      setServiceTypeId(editing.serviceTypeId ?? "");
      setPayrollWindowId(editing.payrollWindowId ?? "");
      setBillingTypeId(editing.billingTypeId ?? "");
      setGstOption(editing.gstOption);
      setStatus(editing.status);
    } else {
      setContractCode(nextContractCode(existingCodes));
      setUnitId("");
      setStartDate("");
      setEndDate("");
      setDescription("");
      setServiceTypeId("");
      setPayrollWindowId("");
      setBillingTypeId("");
      setGstOption("csgst");
      setStatus("active");
    }
    setResources([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // Hydrate existing resources when editing
  useEffect(() => {
    if (open && editing && existingResources.length > 0) {
      setResources(existingResources);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, existingResources.length]);

  const selectedUnit = units.find((u) => u.id === unitId);
  const selectedOrg = selectedUnit?.customerId
    ? customerById.get(selectedUnit.customerId)
    : undefined;

  const selectedWindow = payrollWindows.find((w) => w.id === payrollWindowId);
  const payDate = selectedWindow ? `Day ${selectedWindow.processingDay}` : "—";
  const billingDates = selectedWindow
    ? `${selectedWindow.windowStartDay} – ${selectedWindow.windowEndDay}`
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Contract" : "Create Contract"}</DialogTitle>
          <DialogDescription>
            Capture client information, payroll, billing and GST settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Client Information */}
          <Section title="Client Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contract ID">
                <Input value={contractCode} readOnly className="font-mono" />
              </Field>
              <Field label="Unit ID *">
                <Popover open={unitPickerOpen} onOpenChange={setUnitPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="h-10 w-full justify-between rounded-lg font-normal"
                    >
                      {selectedUnit ? (
                        <span className="truncate font-mono text-xs">
                          {selectedUnit.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search unit ID…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by unit ID or name…" />
                      <CommandList>
                        <CommandEmpty>No units found.</CommandEmpty>
                        <CommandGroup>
                          {units.map((u) => {
                            const org = u.customerId ? customerById.get(u.customerId) : null;
                            return (
                              <CommandItem
                                key={u.id}
                                value={`${u.code} ${u.name} ${org?.name ?? ""} ${u.id}`}
                                onSelect={() => {
                                  setUnitId(u.id);
                                  setUnitPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    unitId === u.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs font-semibold text-accent">
                                    {u.code}
                                  </span>
                                  <span className="text-sm">{u.name}</span>
                                  {org && (
                                    <span className="text-xs text-muted-foreground">
                                      {org.name}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="Unit Name">
                <Input value={selectedUnit?.name ?? ""} readOnly placeholder="Auto-filled" />
              </Field>
              <Field label="Organization Name">
                <Input value={selectedOrg?.name ?? ""} readOnly placeholder="Auto-filled" />
              </Field>
            </div>
          </Section>

          {/* General Information */}
          <Section title="General Information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start Date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="End Date">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
              <Field label="Service Type">
                <Select
                  value={serviceTypeId || "none"}
                  onValueChange={(v) => setServiceTypeId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {serviceTypes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Optional description"
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Payroll Information */}
          <Section title="Payroll Information">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Payroll Window">
                <Select
                  value={payrollWindowId || "none"}
                  onValueChange={(v) => setPayrollWindowId(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Select window" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {payrollWindows.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.label} ({w.windowStartDay}–{w.windowEndDay})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pay Date (auto)">
                <Input value={payDate} readOnly />
              </Field>
              <Field label="Billing Dates (auto)">
                <Input value={billingDates} readOnly />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Billing Type">
                  <Select
                    value={billingTypeId || "none"}
                    onValueChange={(v) => setBillingTypeId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-10 rounded-lg">
                      <SelectValue placeholder="Select billing type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {billingTypes.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>

          {/* GST */}
          <Section title="GST Option">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { value: "csgst", label: "CSGST" },
                  { value: "igst", label: "IGST" },
                  { value: "none", label: "No GST" },
                ] as { value: GstOption; label: string }[]
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    gstOption === opt.value
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-card hover:bg-secondary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="gst-option"
                    value={opt.value}
                    checked={gstOption === opt.value}
                    onChange={() => setGstOption(opt.value)}
                    className="h-4 w-4 accent-accent"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Section>

          {/* Resources */}
          <ResourcesSection
            resources={resources}
            onAdd={() =>
              setResourceDialog({ open: true, index: null, initial: null })
            }
            onEdit={(idx) =>
              setResourceDialog({
                open: true,
                index: idx,
                initial: resources[idx],
              })
            }
            onCopy={(idx) =>
              setResourceDialog({
                open: true,
                index: null,
                initial: { ...resources[idx], id: undefined },
              })
            }
            onDelete={(idx) =>
              setResources((prev) => prev.filter((_, i) => i !== idx))
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!unitId) {
                toast.error("Please select a unit");
                return;
              }
              setSaving(true);
              const err = await onSubmit({
                contractCode,
                unitId,
                startDate,
                endDate,
                description,
                serviceTypeId: serviceTypeId || null,
                payrollWindowId: payrollWindowId || null,
                billingTypeId: billingTypeId || null,
                gstOption,
                status,
              }, resources);
              setSaving(false);
              if (err) toast.error(err);
              else onOpenChange(false);
            }}
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Contract"}
          </Button>
        </DialogFooter>

        <ResourceFormDialog
          open={resourceDialog.open}
          initial={resourceDialog.initial}
          onOpenChange={(o) =>
            setResourceDialog((s) => ({ ...s, open: o }))
          }
          onSubmit={(r) => {
            setResources((prev) => {
              if (resourceDialog.index !== null) {
                const next = [...prev];
                next[resourceDialog.index] = r;
                return next;
              }
              return [...prev, r];
            });
            setResourceDialog({ open: false, index: null, initial: null });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ResourcesSection({
  resources,
  onAdd,
  onEdit,
  onCopy,
  onDelete,
}: {
  resources: ContractResource[];
  onAdd: () => void;
  onEdit: (idx: number) => void;
  onCopy: (idx: number) => void;
  onDelete: (idx: number) => void;
}) {
  const designations = useDesignations();
  const serviceTypes = useServiceTypes();
  const dById = useMemo(
    () => new Map(designations.map((d) => [d.id, d])),
    [designations],
  );
  const sById = useMemo(
    () => new Map(serviceTypes.map((s) => [s.id, s])),
    [serviceTypes],
  );

  return (
    <Section title="Resources">
      {resources.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent/5 hover:text-foreground"
        >
          <Users className="h-6 w-6 opacity-60" />
          <span className="font-medium">No resources mapped to the contract.</span>
          <span className="text-xs">Click here to add resources</span>
        </button>
      ) : (
        <div className="space-y-3">
          {resources.map((r, idx) => {
            const gross = r.components.reduce(
              (s, c) => s + (Number(c.amount) || 0),
              0,
            );
            const dn = dById.get(r.designationId);
            const sn = sById.get(r.serviceTypeId);
            return (
              <div
                key={idx}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {dn?.name ?? "—"}
                      </span>
                      {dn?.code && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {dn.code}
                        </span>
                      )}
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {sn?.name ?? "—"}
                      </span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                        Qty {r.quantity}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.components.map((c) => (
                        <span
                          key={c.allowanceId}
                          className="rounded bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {c.name}: {c.amount.toFixed(2)}
                        </span>
                      ))}
                      {r.components.length === 0 && (
                        <span className="text-[11px] italic text-muted-foreground">
                          No wage components
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-foreground">
                      Gross: {gross.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => onEdit(idx)}
                      aria-label="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => onCopy(idx)}
                      aria-label="Copy"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(idx)}
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onAdd}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add another resource
          </Button>
        </div>
      )}
    </Section>
  );
}

function ResourceFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ContractResource | null;
  onSubmit: (r: ContractResource) => void;
}) {
  const designations = useDesignations();
  const serviceTypes = useServiceTypes();
  const allowanceTypes = useAllowanceTypes();

  const [designationId, setDesignationId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [components, setComponents] = useState<ResourceComponent[]>([]);
  const [designationOpen, setDesignationOpen] = useState(false);
  const [allowancePickerOpen, setAllowancePickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDesignationId(initial.designationId);
      setServiceTypeId(initial.serviceTypeId);
      setQuantity(String(initial.quantity));
      setComponents(initial.components.map((c) => ({ ...c })));
    } else {
      setDesignationId("");
      setServiceTypeId("");
      setQuantity("1");
      // Pre-load defaults from allowance types
      setComponents(
        allowanceTypes
          .filter((a) => a.isDefault)
          .map((a) => ({
            allowanceId: a.id,
            name: a.shortName || a.displayName,
            amount: 0,
          })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, allowanceTypes.length]);

  const gross = components.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const usedIds = new Set(components.map((c) => c.allowanceId));
  const availableExtras = allowanceTypes.filter((a) => !usedIds.has(a.id));

  const updateAmount = (allowanceId: string, amount: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.allowanceId === allowanceId ? { ...c, amount } : c)),
    );
  };

  const removeComponent = (allowanceId: string) => {
    setComponents((prev) => prev.filter((c) => c.allowanceId !== allowanceId));
  };

  const addComponent = (a: AllowanceType) => {
    setComponents((prev) => [
      ...prev,
      {
        allowanceId: a.id,
        name: a.shortName || a.displayName,
        amount: 0,
      },
    ]);
    setAllowancePickerOpen(false);
  };

  const handleSubmit = () => {
    if (!designationId) {
      toast.error("Please select a designation");
      return;
    }
    if (!serviceTypeId) {
      toast.error("Please select a service type");
      return;
    }
    const q = parseInt(quantity, 10);
    if (!q || q < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    onSubmit({
      id: initial?.id,
      designationId,
      serviceTypeId,
      quantity: q,
      components,
    });
  };

  const selectedDesignation = designations.find((d) => d.id === designationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Edit Resource" : "Add Resource"}
          </DialogTitle>
          <DialogDescription>
            Map a designation, service type and quantity, then configure wage
            components.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Designation *">
              <Popover open={designationOpen} onOpenChange={setDesignationOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="h-10 w-full justify-between rounded-lg font-normal"
                  >
                    {selectedDesignation ? (
                      <span className="truncate">
                        {selectedDesignation.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search designation…" />
                    <CommandList>
                      <CommandEmpty>No designation found.</CommandEmpty>
                      <CommandGroup>
                        {designations.map((d) => (
                          <CommandItem
                            key={d.id}
                            value={`${d.code} ${d.name} ${d.id}`}
                            onSelect={() => {
                              setDesignationId(d.id);
                              setDesignationOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                designationId === d.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm">{d.name}</span>
                              {d.code && (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {d.code}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Service Type *">
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Quantity *">
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Wages Components
              </h4>
              <Popover
                open={allowancePickerOpen}
                onOpenChange={setAllowancePickerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={availableExtras.length === 0}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add allowance
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search allowance…" />
                    <CommandList>
                      <CommandEmpty>No more allowances.</CommandEmpty>
                      <CommandGroup>
                        {availableExtras.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={`${a.shortName} ${a.displayName} ${a.name}`}
                            onSelect={() => addComponent(a)}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {a.shortName || a.displayName}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {a.displayName}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {components.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No wage components yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {components.map((c) => (
                  <div key={c.allowanceId} className="grid gap-1">
                    <Label className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span className="truncate">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => removeComponent(c.allowanceId)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={c.amount}
                      onChange={(e) =>
                        updateAmount(
                          c.allowanceId,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gross
              </span>
              <span className="ml-3 text-base font-bold text-foreground">
                {gross.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {initial?.id ? "Save Resource" : "Add Resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
