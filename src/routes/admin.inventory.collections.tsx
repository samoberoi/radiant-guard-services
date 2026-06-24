import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, PackageCheck, Inbox } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postMovements, type LocationType } from "@/lib/inv-helpers";
import { useAuth, SUPER_ADMIN_PHONE } from "@/lib/auth";

export const Route = createFileRoute("/admin/inventory/collections")({ component: CollectionsPage });

const MODULE = "Inventory Collections";
const ENTITY = "inv_issuances";

type Candidate = { id: string; full_name: string; employee_code: string; role_key: string; unit_id: string | null; reports_to: string | null };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type CollectionRow = {
  id: string;
  issuance_number: string;
  issuance_date: string;
  issued_at: string | null;
  destination_id: string;
  destination_type: string;
  source_id: string;
  notes: string;
  lines: { item_id: string; size_value: string; qty: number }[];
};

function CollectionsPage() {
  const { user } = useAuth();
  const myPhone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";
  const isSuperAdmin = myPhone === SUPER_ADMIN_PHONE;

  const { data: me = null } = useQuery({
    queryKey: ["candidate-by-phone", myPhone],
    enabled: !!myPhone && !isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,role_key,unit_id,reports_to")
        .eq("mobile", myPhone)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Candidate) ?? null;
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates-active-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,role_key,unit_id,reports_to")
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Candidate[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_items" as never)
        .select("id,name,item_code,is_sized")
        .eq("enabled", true)
        .order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const isFieldOfficer = !isSuperAdmin && me?.role_key === "field_officer";

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Collect issued items back from guards. Confirming returns the stock to your field-officer inventory."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Collections" }]}
      />
      {!isFieldOfficer || !me ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Collections are available to field officers only.
        </div>
      ) : (
        <CollectionsPanel me={me} candMap={candMap} itemMap={itemMap} />
      )}
    </div>
  );
}

function CollectionsPanel({ me, candMap, itemMap }: {
  me: Candidate;
  candMap: Map<string, Candidate>;
  itemMap: Map<string, Item>;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inv", "collections", me.id],
    queryFn: async () => {
      const { data: iss, error } = await supabase
        .from("inv_issuances" as never)
        .select("id,issuance_number,issuance_date,issued_at,source_id,source_type,destination_id,destination_type,notes,status,collected_at")
        .eq("issuance_type", "fo_to_guard")
        .eq("source_id", me.id)
        .eq("status", "completed")
        .is("collected_at", null)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      const list = (iss as unknown as { id: string; issuance_number: string; issuance_date: string; issued_at: string | null; source_id: string; source_type: string; destination_id: string; destination_type: string; notes: string }[]) ?? [];
      if (!list.length) return [] as CollectionRow[];
      const ids = list.map((x) => x.id);
      const { data: lns } = await supabase
        .from("inv_issuance_lines" as never)
        .select("issuance_id,item_id,size_value,qty")
        .in("issuance_id", ids);
      const byIss = new Map<string, { item_id: string; size_value: string; qty: number }[]>();
      for (const l of (lns as unknown as { issuance_id: string; item_id: string; size_value: string | null; qty: number }[]) ?? []) {
        const arr = byIss.get(l.issuance_id) ?? [];
        arr.push({ item_id: l.item_id, size_value: l.size_value ?? "", qty: Number(l.qty ?? 0) });
        byIss.set(l.issuance_id, arr);
      }
      return list.map<CollectionRow>((i) => ({
        id: i.id,
        issuance_number: i.issuance_number,
        issuance_date: i.issuance_date,
        issued_at: i.issued_at,
        destination_id: i.destination_id,
        destination_type: i.destination_type,
        source_id: i.source_id,
        notes: i.notes,
        lines: byIss.get(i.id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const guard = candMap.get(r.destination_id)?.full_name?.toLowerCase() ?? "";
      return r.issuance_number.toLowerCase().includes(s) || guard.includes(s);
    });
  }, [rows, q, candMap]);

  const collectMut = useMutation({
    mutationFn: async (r: CollectionRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const movs = r.lines.flatMap((l) => ([
        {
          movement_type: "COLLECT_GUARD_OUT",
          location_type: r.destination_type as LocationType,
          location_id: r.destination_id,
          item_id: l.item_id, size_value: l.size_value, qty_change: -l.qty,
          reference_type: "collection", reference_id: r.id,
        },
        {
          movement_type: "COLLECT_FO_IN",
          location_type: "field_officer" as LocationType,
          location_id: me.id,
          item_id: l.item_id, size_value: l.size_value, qty_change: l.qty,
          reference_type: "collection", reference_id: r.id,
        },
      ]));
      await postMovements(movs);
      await supabase.from("inv_issuances" as never).update({
        status: "collected",
        collected_at: new Date().toISOString(),
        collected_by: user?.id ?? null,
      } as never).eq("id", r.id);
      void logActivity({ module: MODULE, action: "acknowledge", entityType: ENTITY, entityId: r.id, entityLabel: `Collected ${r.issuance_number}` });
    },
    onSuccess: () => {
      toast.success("Collected — stock returned to you");
      qc.invalidateQueries({ queryKey: ["inv", "collections", me.id] });
      qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
      qc.invalidateQueries({ queryKey: ["inv", "issuances"] });
    },
  });

  async function collect(r: CollectionRow) {
    if (!(await confirmAction({
      title: "Confirm collection",
      description: "Kindly confirm you have collected it. Items will be removed from the guard and added back to your stock.",
      confirmText: "Confirm Collected",
    }))) return;
    setBusy(r.id);
    try { await collectMut.mutateAsync(r); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search issuance # or guard…" className="h-10 rounded-lg pl-9" />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} pending</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Issuance #</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">To (Guard)</th>
                <th className="px-5 py-3">Issued On</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const guard = candMap.get(r.destination_id);
                return (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs">{r.issuance_number}</td>
                    <td className="px-5 py-3">{me.full_name}<div className="text-[11px] uppercase tracking-wider text-muted-foreground">Field Officer</div></td>
                    <td className="px-5 py-3 font-medium">{guard?.full_name ?? "—"}<div className="text-[11px] uppercase tracking-wider text-muted-foreground">{guard?.employee_code ?? ""}</div></td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{(r.issued_at ?? r.issuance_date).slice(0, 10)}</td>
                    <td className="px-5 py-3 text-xs">
                      {r.lines.map((l, idx) => (
                        <div key={idx}>
                          <span className="font-medium">{itemMap.get(l.item_id)?.name ?? "—"}</span>
                          {l.size_value && <span className="text-muted-foreground"> · {l.size_value}</span>}
                          <span className="text-muted-foreground"> × {l.qty}</span>
                        </div>
                      ))}
                      {!r.lines.length && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" disabled={busy === r.id} onClick={() => collect(r)} className="h-8 rounded-md">
                        <PackageCheck className="mr-1.5 h-4 w-4" />{busy === r.id ? "Collecting…" : "Collect"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {isLoading ? "Loading…" : "Nothing pending collection."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
