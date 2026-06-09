import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { logActivity } from "@/lib/activity-log";
import { fmtINR } from "@/lib/payroll-calc";

export const Route = createFileRoute("/admin/payroll/internal-salary")({
  component: InternalSalaryPage,
});

type LineItem = { name: string; amount: number };
type PayrollDayBaseLite = { id: string; name: string; code: string };
type RoleLite = { key: string; name: string };

type InternalResource = {
  id: string | null;
  role_key: string;
  components: LineItem[];
  benefits: LineItem[];
  deductions: LineItem[];
  employer_contributions: LineItem[];
  payroll_day_base_id: string | null;
};

const QK_CT = ["admin", "internal-contract"] as const;
const QK_ROLES = ["admin", "roles", "internal-salary"] as const;
const QK_PDB = ["admin", "payroll-day-bases", "enabled"] as const;
const QK_RES = ["admin", "internal-resources"] as const;

function toLineList(j: unknown): LineItem[] {
  if (!Array.isArray(j)) return [];
  return j
    .map((r: any) => ({
      name: String(r?.name ?? r?.label ?? ""),
      amount: Number(r?.amount ?? 0) || 0,
    }))
    .filter((r) => r.name.trim().length > 0);
}

function sum(items: LineItem[]): number {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

function InternalSalaryPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<InternalResource | null>(null);

  const contractQ = useQuery({
    queryKey: QK_CT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contracts")
        .select("id, contract_code, status, approval_status")
        .eq("is_internal" as never, true as never)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; contract_code: string } | null;
    },
  });

  const rolesQ = useQuery({
    queryKey: QK_ROLES,
    queryFn: async (): Promise<RoleLite[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("key, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ key: r.key, name: r.name }));
    },
  });

  const pdbQ = useQuery({
    queryKey: QK_PDB,
    queryFn: async (): Promise<PayrollDayBaseLite[]> => {
      const { data, error } = await supabase
        .from("payroll_day_bases" as never)
        .select("id, name, code, enabled")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.enabled !== false)
        .map((r) => ({ id: r.id, name: r.name, code: r.code }));
    },
  });

  const contractId = contractQ.data?.id ?? null;

  const resourcesQ = useQuery({
    queryKey: [...QK_RES, contractId],
    enabled: !!contractId,
    queryFn: async (): Promise<InternalResource[]> => {
      const { data, error } = await supabase
        .from("contract_resources")
        .select(
          "id, role_key, components, benefits, deductions, employer_contributions, payroll_day_base_id",
        )
        .eq("contract_id", contractId!)
        .not("role_key" as never, "is", null as never);
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.role_key)
        .map((r) => ({
          id: r.id,
          role_key: r.role_key,
          components: toLineList(r.components),
          benefits: toLineList(r.benefits),
          deductions: toLineList(r.deductions),
          employer_contributions: toLineList(r.employer_contributions),
          payroll_day_base_id: r.payroll_day_base_id ?? null,
        }));
    },
  });

  const byRole = useMemo(() => {
    const m = new Map<string, InternalResource>();
    (resourcesQ.data ?? []).forEach((r) => m.set(r.role_key, r));
    return m;
  }, [resourcesQ.data]);

  const saveMut = useMutation({
    mutationFn: async (payload: InternalResource) => {
      if (!contractId) throw new Error("Internal contract not configured");
      const gross = sum(payload.components);
      const row = {
        contract_id: contractId,
        role_key: payload.role_key,
        designation_id: null,
        service_type_id: null,
        quantity: 1,
        gross,
        components: payload.components as unknown as any,
        benefits: payload.benefits as unknown as any,
        deductions: payload.deductions as unknown as any,
        employer_contributions: payload.employer_contributions as unknown as any,
        payroll_day_base_id: payload.payroll_day_base_id,
        sort_order: 0,
      };
      let id = payload.id;
      if (id) {
        const { error } = await supabase
          .from("contract_resources")
          .update(row as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("contract_resources")
          .insert(row as never)
          .select("id")
          .single();
        if (error) throw error;
        id = (data as any).id as string;
      }
      const roleName =
        rolesQ.data?.find((r) => r.key === payload.role_key)?.name ?? payload.role_key;
      await logActivity({
        module: "Internal Salary Structures",
        action: payload.id ? "update" : "create",
        entityType: "internal_salary_structure",
        entityId: id ?? "",
        entityLabel: roleName,
        after: row as any,
      });
      return id;
    },
    onSuccess: () => {
      toast.success("Salary structure saved");
      qc.invalidateQueries({ queryKey: QK_RES });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: async (r: InternalResource) => {
      if (!r.id) return;
      const { error } = await supabase
        .from("contract_resources")
        .delete()
        .eq("id", r.id);
      if (error) throw error;
      const roleName = rolesQ.data?.find((x) => x.key === r.role_key)?.name ?? r.role_key;
      await logActivity({
        module: "Internal Salary Structures",
        action: "delete",
        entityType: "internal_salary_structure",
        entityId: r.id,
        entityLabel: roleName,
      });
    },
    onSuccess: () => {
      toast.success("Salary structure removed");
      qc.invalidateQueries({ queryKey: QK_RES });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  const loading =
    contractQ.isLoading || rolesQ.isLoading || pdbQ.isLoading || resourcesQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Salary Structures"
        description="Configure per-role salary structures for non-billable Radiant Guard staff. Roles without a structure here will simply have no salary slip."
      />

      {!contractQ.isLoading && !contractQ.data && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Radiant Guard internal contract is missing. Mark one client contract as
          internal before configuring salaries here.
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead>Components</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead className="w-[220px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : (rolesQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No roles configured.
                </TableCell>
              </TableRow>
            ) : (
              (rolesQ.data ?? []).map((role) => {
                const existing = byRole.get(role.key);
                const gross = existing ? sum(existing.components) : 0;
                return (
                  <TableRow key={role.key}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="text-right">
                      {existing ? fmtINR(gross) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {existing ? `${existing.components.length} line(s)` : "Not configured"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {existing ? `${existing.deductions.length} line(s)` : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant={existing ? "outline" : "default"}
                        onClick={() =>
                          setEditing(
                            existing ?? {
                              id: null,
                              role_key: role.key,
                              components: [],
                              benefits: [],
                              deductions: [],
                              employer_contributions: [],
                              payroll_day_base_id: null,
                            },
                          )
                        }
                        disabled={!contractId}
                      >
                        {existing ? "Edit" : "Configure"}
                      </Button>
                      {existing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Remove salary structure for ${role.name}?`)) {
                              deleteMut.mutate(existing);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditorDialog
          value={editing}
          roles={rolesQ.data ?? []}
          payrollDayBases={pdbQ.data ?? []}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveMut.mutate(v)}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function EditorDialog({
  value,
  roles,
  payrollDayBases,
  onCancel,
  onSave,
  saving,
}: {
  value: InternalResource;
  roles: RoleLite[];
  payrollDayBases: PayrollDayBaseLite[];
  onCancel: () => void;
  onSave: (v: InternalResource) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<InternalResource>(value);
  const roleName = roles.find((r) => r.key === draft.role_key)?.name ?? draft.role_key;
  const gross = sum(draft.components);
  const totalDed = sum(draft.deductions);
  const netPay = gross - totalDed;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Salary structure — {roleName}</DialogTitle>
          <DialogDescription>
            Gross is the sum of components. Deductions reduce net pay. Employer
            contributions are paid by the company on top of gross.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label>Payroll day base</Label>
            <Select
              value={draft.payroll_day_base_id ?? "_none"}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  payroll_day_base_id: v === "_none" ? null : v,
                }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Default (period days)</SelectItem>
                {payrollDayBases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <LineEditor
            title="Components (earnings)"
            items={draft.components}
            onChange={(items) => setDraft((d) => ({ ...d, components: items }))}
          />
          <LineEditor
            title="Benefits"
            items={draft.benefits}
            onChange={(items) => setDraft((d) => ({ ...d, benefits: items }))}
          />
          <LineEditor
            title="Deductions"
            items={draft.deductions}
            onChange={(items) => setDraft((d) => ({ ...d, deductions: items }))}
          />
          <LineEditor
            title="Employer contributions"
            items={draft.employer_contributions}
            onChange={(items) =>
              setDraft((d) => ({ ...d, employer_contributions: items }))
            }
          />

          <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground">Gross</div>
              <div className="font-semibold">{fmtINR(gross)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total deductions</div>
              <div className="font-semibold">{fmtINR(totalDed)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Net pay</div>
              <div className="font-semibold">{fmtINR(netPay)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            onClick={() => {
              const cleaned = {
                ...draft,
                components: draft.components.filter((c) => c.name.trim()),
                benefits: draft.benefits.filter((c) => c.name.trim()),
                deductions: draft.deductions.filter((c) => c.name.trim()),
                employer_contributions: draft.employer_contributions.filter((c) =>
                  c.name.trim(),
                ),
              };
              onSave(cleaned);
            }}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...items, { name: "", amount: 0 }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No entries.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                placeholder="Label (e.g. Basic, HRA, PF)"
                value={it.name}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], name: e.target.value };
                  onChange(next);
                }}
              />
              <Input
                type="number"
                placeholder="Amount"
                className="w-40"
                value={Number.isFinite(it.amount) ? it.amount : 0}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                  onChange(next);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
