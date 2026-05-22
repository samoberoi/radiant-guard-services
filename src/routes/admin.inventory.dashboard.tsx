import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, TrendingDown, Users, Building2, ShieldCheck, Trophy, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/inventory/dashboard")({
  component: OwnerDashboard,
});

type Balance = { location_type: string; location_id: string; item_id: string; size_value: string; qty: number };
type Item = { id: string; item_code: string; name: string; default_reorder_level: number; is_sized: boolean };
type ItemSize = { item_id: string; size_value: string; reorder_level: number };
type Vendor = { id: string; name: string; vendor_code: string };
type RateCard = { vendor_id: string; item_id: string; size_value: string; unit_price: number };
type POLine = { po_id: string; item_id: string; ordered_qty: number; accepted_qty: number; line_total: number };
type PO = { id: string; vendor_id: string; status: string };
type Cand = { id: string; full_name: string; employee_code: string; role_key: string };
type Branch = { id: string; name: string; code: string };

function OwnerDashboard() {
  const [q, setQ] = useState("");

  const balancesQ = useQuery({
    queryKey: ["dash", "balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_stock_balances" as never).select("location_type,location_id,item_id,size_value,qty");
      if (error) throw error;
      return (data as unknown as Balance[]) ?? [];
    },
  });
  const itemsQ = useQuery({
    queryKey: ["dash", "items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,item_code,name,default_reorder_level,is_sized");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });
  const sizesQ = useQuery({
    queryKey: ["dash", "sizes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_item_sizes" as never).select("item_id,size_value,reorder_level");
      if (error) throw error;
      return (data as unknown as ItemSize[]) ?? [];
    },
  });
  const vendorsQ = useQuery({
    queryKey: ["dash", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendors" as never).select("id,name,vendor_code");
      if (error) throw error;
      return (data as unknown as Vendor[]) ?? [];
    },
  });
  const rateCardsQ = useQuery({
    queryKey: ["dash", "rate-cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).select("vendor_id,item_id,size_value,unit_price").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as RateCard[]) ?? [];
    },
  });
  const poQ = useQuery({
    queryKey: ["dash", "pos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_purchase_orders" as never).select("id,vendor_id,status");
      if (error) throw error;
      return (data as unknown as PO[]) ?? [];
    },
  });
  const poLinesQ = useQuery({
    queryKey: ["dash", "po-lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_po_lines" as never).select("po_id,item_id,ordered_qty,accepted_qty,line_total");
      if (error) throw error;
      return (data as unknown as POLine[]) ?? [];
    },
  });
  const candsQ = useQuery({
    queryKey: ["dash", "cands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("id,full_name,employee_code,role_key").in("status", ["approved", "active"]);
      if (error) throw error;
      return (data as unknown as Cand[]) ?? [];
    },
  });
  const branchesQ = useQuery({
    queryKey: ["dash", "branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id,name,code");
      if (error) throw error;
      return (data as unknown as Branch[]) ?? [];
    },
  });

  const items = itemsQ.data ?? [];
  const sizes = sizesQ.data ?? [];
  const balances = balancesQ.data ?? [];
  const vendors = vendorsQ.data ?? [];
  const rateCards = rateCardsQ.data ?? [];
  const pos = poQ.data ?? [];
  const poLines = poLinesQ.data ?? [];
  const cands = candsQ.data ?? [];
  const branches = branchesQ.data ?? [];

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  // Low stock: warehouse + branch balances vs reorder level
  const lowStock = useMemo(() => {
    const grouped = new Map<string, { item_id: string; size_value: string; total: number }>();
    for (const b of balances) {
      if (b.location_type !== "warehouse" && b.location_type !== "branch") continue;
      const key = `${b.item_id}|${b.size_value}`;
      const cur = grouped.get(key) ?? { item_id: b.item_id, size_value: b.size_value, total: 0 };
      cur.total += Number(b.qty ?? 0);
      grouped.set(key, cur);
    }
    const sizeMap = new Map(sizes.map((s) => [`${s.item_id}|${s.size_value}`, s.reorder_level]));
    const rows: { item: Item; size_value: string; qty: number; reorder: number }[] = [];
    for (const [key, g] of grouped) {
      const item = itemMap.get(g.item_id);
      if (!item) continue;
      const reorder = sizeMap.get(key) ?? item.default_reorder_level;
      if (reorder > 0 && g.total <= reorder) {
        rows.push({ item, size_value: g.size_value, qty: g.total, reorder });
      }
    }
    return rows.sort((a, b) => a.qty / Math.max(1, a.reorder) - b.qty / Math.max(1, b.reorder));
  }, [balances, sizes, itemMap]);

  // Cheapest vendor per item (from rate cards)
  const cheapestPerItem = useMemo(() => {
    const map = new Map<string, { vendor_id: string; unit_price: number }>();
    for (const rc of rateCards) {
      const cur = map.get(rc.item_id);
      if (!cur || rc.unit_price < cur.unit_price) {
        map.set(rc.item_id, { vendor_id: rc.vendor_id, unit_price: rc.unit_price });
      }
    }
    return Array.from(map.entries()).map(([item_id, v]) => ({
      item: itemMap.get(item_id),
      vendor: vendorMap.get(v.vendor_id),
      unit_price: v.unit_price,
    })).filter((r) => r.item && r.vendor);
  }, [rateCards, itemMap, vendorMap]);

  // Vendor leaderboard by total spend
  const vendorSpend = useMemo(() => {
    const poVendor = new Map(pos.map((p) => [p.id, p.vendor_id]));
    const tally = new Map<string, number>();
    for (const l of poLines) {
      const vid = poVendor.get(l.po_id);
      if (!vid) continue;
      tally.set(vid, (tally.get(vid) ?? 0) + Number(l.line_total ?? 0));
    }
    return Array.from(tally.entries())
      .map(([vid, total]) => ({ vendor: vendorMap.get(vid), total }))
      .filter((r) => r.vendor)
      .sort((a, b) => b.total - a.total);
  }, [pos, poLines, vendorMap]);

  // Holdings by guard / FO / branch
  const buildHoldings = (locType: "guard" | "field_officer" | "branch") => {
    const grouped = new Map<string, { qty: number; lines: { item_id: string; size_value: string; qty: number }[] }>();
    for (const b of balances) {
      if (b.location_type !== locType) continue;
      if (Number(b.qty) <= 0) continue;
      const cur = grouped.get(b.location_id) ?? { qty: 0, lines: [] };
      cur.qty += Number(b.qty);
      cur.lines.push({ item_id: b.item_id, size_value: b.size_value, qty: Number(b.qty) });
      grouped.set(b.location_id, cur);
    }
    return Array.from(grouped.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.qty - a.qty);
  };
  const guardHoldings = useMemo(() => buildHoldings("guard"), [balances]);
  const foHoldings = useMemo(() => buildHoldings("field_officer"), [balances]);
  const branchHoldings = useMemo(() => buildHoldings("branch"), [balances]);

  const filter = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  return (
    <div>
      <PageHeader
        title="Inventory Dashboard"
        description="Owner view — low stock, vendor leaderboard, who is holding what."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Dashboard" }]}
      />

      <div className="mb-4 flex items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items / vendors / people…" className="max-w-sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low stock */}
        <Card title="Low Stock Alerts" subtitle="Warehouse + Branch combined, at/below reorder" icon={AlertTriangle} accent="text-amber-500">
          {lowStock.length === 0 ? <Empty>No items at reorder level.</Empty> : (
            <Table head={["Item", "Size", "On Hand", "Reorder"]}>
              {lowStock.filter((r) => filter(r.item.name) || filter(r.item.item_code)).slice(0, 25).map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="p-2"><Link to="/admin/inventory/items" className="hover:underline">{r.item.item_code} — {r.item.name}</Link></td>
                  <td className="p-2 text-muted-foreground">{r.size_value || "—"}</td>
                  <td className="p-2 tabular-nums font-semibold text-amber-600">{r.qty}</td>
                  <td className="p-2 tabular-nums text-muted-foreground">{r.reorder}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Vendor leaderboard */}
        <Card title="Vendor Leaderboard" subtitle="By total PO spend" icon={Trophy} accent="text-accent">
          {vendorSpend.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
            <Table head={["#", "Vendor", "Total Spend"]}>
              {vendorSpend.filter((r) => filter(r.vendor!.name)).slice(0, 15).map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="p-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="p-2"><Link to="/admin/inventory/vendors" className="hover:underline">{r.vendor!.vendor_code} — {r.vendor!.name}</Link></td>
                  <td className="p-2 tabular-nums font-semibold">₹{r.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Cheapest vendor per item */}
        <Card title="Cheapest Vendor per Item" subtitle="Based on active rate cards" icon={IndianRupee} accent="text-emerald-500">
          {cheapestPerItem.length === 0 ? <Empty>No rate cards configured.</Empty> : (
            <Table head={["Item", "Vendor", "Unit Price"]}>
              {cheapestPerItem.filter((r) => filter(r.item!.name) || filter(r.vendor!.name)).slice(0, 25).map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="p-2">{r.item!.item_code} — {r.item!.name}</td>
                  <td className="p-2 text-muted-foreground">{r.vendor!.name}</td>
                  <td className="p-2 tabular-nums font-semibold">₹{r.unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Branch holdings */}
        <Card title="Branch Holdings" subtitle="Total qty per branch" icon={Building2} accent="text-blue-500">
          {branchHoldings.length === 0 ? <Empty>No branch stock.</Empty> : (
            <Table head={["Branch", "Lines", "Total Qty"]}>
              {branchHoldings.filter((r) => filter(branchMap.get(r.id)?.name ?? "")).map((r, i) => {
                const b = branchMap.get(r.id);
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2">{b ? `${b.code} — ${b.name}` : r.id.slice(0, 8)}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.lines.length}</td>
                    <td className="p-2 tabular-nums font-semibold">{r.qty.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        {/* FO holdings */}
        <Card title="Field Officer Holdings" subtitle="In-hand stock with FOs" icon={Users} accent="text-violet-500">
          {foHoldings.length === 0 ? <Empty>No FO stock.</Empty> : (
            <Table head={["Field Officer", "Items", "Total Qty"]}>
              {foHoldings.filter((r) => filter(candMap.get(r.id)?.full_name ?? "")).slice(0, 25).map((r, i) => {
                const c = candMap.get(r.id);
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2">{c ? `${c.employee_code} — ${c.full_name}` : r.id.slice(0, 8)}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.lines.length}</td>
                    <td className="p-2 tabular-nums font-semibold">{r.qty.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        {/* Guard holdings */}
        <Card title="Guard Holdings" subtitle="Issued to guards, not yet returned" icon={ShieldCheck} accent="text-teal-500">
          {guardHoldings.length === 0 ? <Empty>No guard issuances.</Empty> : (
            <Table head={["Guard", "Items", "Total Qty"]}>
              {guardHoldings.filter((r) => filter(candMap.get(r.id)?.full_name ?? "")).slice(0, 25).map((r, i) => {
                const c = candMap.get(r.id);
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2">{c ? `${c.employee_code} — ${c.full_name}` : r.id.slice(0, 8)}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.lines.length}</td>
                    <td className="p-2 tabular-nums font-semibold">{r.qty.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, subtitle, icon: Icon, accent, children }: { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/40 ${accent}`}><Icon className="h-4 w-4" /></div>
        <div>
          <div className="font-display text-sm font-bold tracking-tight">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
