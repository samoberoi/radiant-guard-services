import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Download, AlertTriangle, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/inventory/stock")({ component: StockPage });

type Balance = { location_type: string; location_id: string; item_id: string; size_value: string; qty: number };

function StockPage() {
  const { data: balances = [] } = useQuery({
    queryKey: ["inv", "stock-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_stock_balances" as never).select("*");
      if (error) throw error;
      return (data as unknown as Balance[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list-full"],
    queryFn: async () => {
      const { data } = await supabase.from("inv_items" as never).select("id,name,item_code,unit,default_reorder_level");
      return (data as unknown as { id: string; name: string; item_code: string; unit: string; default_reorder_level: number }[]) ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({ queryKey: ["inv", "warehouses-list-full"], queryFn: async () => { const { data } = await supabase.from("inv_warehouses" as never).select("id,name"); return (data as unknown as { id: string; name: string }[]) ?? []; } });
  const { data: branches = [] } = useQuery({ queryKey: ["branches-full"], queryFn: async () => { const { data } = await supabase.from("branches" as never).select("id,name"); return (data as unknown as { id: string; name: string }[]) ?? []; } });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates-min-all"], queryFn: async () => { const { data } = await supabase.from("candidates" as never).select("id,full_name,employee_code,role_key"); return (data as unknown as { id: string; full_name: string; employee_code: string; role_key: string }[]) ?? []; } });
  const { data: scopeAssignments = [] } = useQuery({
    queryKey: ["admin", "employee_scope_assignments", "stock-page"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_scope_assignments" as never).select("candidate_id,scope_type,scope_id");
      return (data as unknown as { candidate_id: string; scope_type: string; scope_id: string }[]) ?? [];
    },
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const brMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const cMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const fieldOfficers = useMemo(
    () => candidates.filter((c) => c.role_key === "field_officer").sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [candidates],
  );

  const locName = (type: string, id: string) => {
    if (type === "warehouse") return whMap.get(id) ?? "—";
    if (type === "branch") return brMap.get(id) ?? "—";
    if (type === "field_officer" || type === "guard") {
      const c = cMap.get(id);
      return c ? `${c.full_name} (${c.employee_code})` : "—";
    }
    if (type === "scrap") return "Scrap";
    return "—";
  };

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "warehouse" | "branch">("all");
  const [specificFilter, setSpecificFilter] = useState<string>("all");
  const [foFilter, setFoFilter] = useState<string>("all");

  // FO list filtered by selected branch (via employee_scope_assignments)
  const fosForBranch = useMemo(() => {
    if (typeFilter !== "branch" || specificFilter === "all") return fieldOfficers;
    const ids = new Set(
      scopeAssignments
        .filter((a) => a.scope_type === "branch" && a.scope_id === specificFilter)
        .map((a) => a.candidate_id),
    );
    return fieldOfficers.filter((f) => ids.has(f.id));
  }, [typeFilter, specificFilter, scopeAssignments, fieldOfficers]);

  const enriched = useMemo(() => {
    return balances
      .filter((b) => Number(b.qty) !== 0)
      .filter((b) => {
        // If a specific field officer is picked, only show that FO's rows
        if (foFilter !== "all") {
          return b.location_type === "field_officer" && b.location_id === foFilter;
        }
        // Otherwise filter by location type/specific
        if (b.location_type !== "warehouse" && b.location_type !== "branch") return false;
        if (typeFilter !== "all" && b.location_type !== typeFilter) return false;
        if (specificFilter !== "all" && b.location_id !== specificFilter) return false;
        return true;
      })
      .map((b) => {
        const it = itemMap.get(b.item_id);
        return {
          ...b,
          item_name: it?.name ?? "—",
          item_code: it?.item_code ?? "",
          unit: it?.unit ?? "",
          reorder: it?.default_reorder_level ?? 0,
          location_label: locName(b.location_type, b.location_id),
          low: Number(b.qty) > 0 && Number(b.qty) <= (it?.default_reorder_level ?? 0),
        };
      })
      .filter((r) => {
        if (!q.trim()) return true;
        const t = q.toLowerCase();
        return r.item_name.toLowerCase().includes(t) || r.item_code.toLowerCase().includes(t) || r.location_label.toLowerCase().includes(t);
      })
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [balances, itemMap, typeFilter, specificFilter, foFilter, q, whMap, brMap, cMap]);

  const lowCount = enriched.filter((r) => r.low).length;
  const totalQty = enriched.reduce((s, r) => s + Number(r.qty), 0);

  const specificOptions = typeFilter === "warehouse" ? warehouses : typeFilter === "branch" ? branches : [];

  return (
    <div>
      <PageHeader title="Stock by Location" description="Live balances across warehouses, branches and field officers." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Stock" }]} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Rows</div><div className="mt-1 font-display text-2xl font-bold tabular-nums">{enriched.length.toLocaleString("en-IN")}</div></div>
        <div className="rounded-2xl border border-border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Total Qty</div><div className="mt-1 font-display text-2xl font-bold tabular-nums">{totalQty.toLocaleString("en-IN")}</div></div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Low stock</div><div className="mt-1 font-display text-2xl font-bold tabular-nums text-amber-700">{lowCount}</div></div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or location…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as "all" | "warehouse" | "branch"); setSpecificFilter("all"); setFoFilter("all"); }}>
            <SelectTrigger className="h-10 w-44 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              <SelectItem value="warehouse">Warehouses</SelectItem>
              <SelectItem value="branch">Branches</SelectItem>
            </SelectContent>
          </Select>
          {typeFilter !== "all" && (
            <Select value={specificFilter} onValueChange={(v) => { setSpecificFilter(v); setFoFilter("all"); }}>
              <SelectTrigger className="h-10 w-56 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {typeFilter === "warehouse" ? "warehouses" : "branches"}</SelectItem>
                {specificOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={foFilter} onValueChange={setFoFilter}>
            <SelectTrigger className="h-10 w-56 rounded-lg"><SelectValue placeholder="Field officer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All field officers</SelectItem>
              {fosForBranch.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name} ({f.employee_code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="h-10 rounded-lg" disabled={!enriched.length} onClick={() => downloadCsv("stock-balances", enriched.map((r) => ({
          location_type: r.location_type, location: r.location_label, item_code: r.item_code, item: r.item_name,
          size: r.size_value, qty: r.qty, unit: r.unit, low_stock: r.low ? "Yes" : "No",
        })))}><Download className="mr-1.5 h-4 w-4" />Export</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-5 py-3">Location</th><th className="px-5 py-3">Holder</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Size</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3">Unit</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enriched.map((r) => (
                <tr key={r.location_type + r.location_id + r.item_id + r.size_value} className={r.low ? "bg-amber-500/5" : "hover:bg-secondary/30"}>
                  <td className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground">{r.location_type.replace("_", " ")}</td>
                  <td className="px-5 py-3 font-medium">{r.location_label}</td>
                  <td className="px-5 py-3"><span className="font-medium">{r.item_name}</span><span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.item_code}</span></td>
                  <td className="px-5 py-3 text-xs">{r.size_value || "—"}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${r.low ? "text-amber-700" : ""}`}>{Number(r.qty).toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{r.unit}</td>
                </tr>
              ))}
              {!enriched.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground"><BarChart3 className="mx-auto mb-2 h-8 w-8 opacity-40" />No balances to show.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
