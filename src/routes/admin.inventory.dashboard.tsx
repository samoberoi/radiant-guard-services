import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle, Users, Building2, ShieldCheck, IndianRupee,
  Package, ShoppingCart, TrendingUp, TrendingDown, ArrowRight,
  Boxes, Truck, Wallet, Warehouse, PackageOpen, ClipboardList,
  SlidersHorizontal, UserPlus, FileText,
} from "lucide-react";
import { useCurrentPermissions } from "@/lib/rbac";

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Owner Dashboard is now merged into the /admin/inventory hub.
// This route redirects there so any old links / bookmarks keep working.
export const Route = createFileRoute("/admin/inventory/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/inventory" });
  },
  component: () => null,
});

type Balance = { location_type: string; location_id: string; item_id: string; size_value: string; qty: number };
type Item = { id: string; item_code: string; name: string; default_reorder_level: number; is_sized: boolean; standard_cost: number; category_id: string | null };
type Category = { id: string; name: string };
type ItemSize = { item_id: string; size_value: string; reorder_level: number };
type Vendor = { id: string; name: string; vendor_code: string; city: string };
type RateCard = { vendor_id: string; item_id: string; size_value: string; unit_price: number };
type POLine = { po_id: string; item_id: string; ordered_qty: number; accepted_qty: number; line_total: number; unit_price: number };
type PO = { id: string; po_number: string; vendor_id: string; status: string; po_date: string; grand_total: number; destination_warehouse_id: string | null };
type Cand = { id: string; full_name: string; employee_code: string; role_key: string; designation_id: string | null };
type Branch = { id: string; name: string; code: string };
type Designation = { id: string; name: string };
type GRN = { id: string; receipt_date: string; po_id: string | null; vendor_id: string | null; status: string };
type WriteOff = { id: string; writeoff_date: string; recovery_amount: number; status: string };

type Range = "today" | "7d" | "30d" | "90d" | "mtd" | "ytd";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  ytd: "Year to date",
};

function rangeWindow(r: Range): { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  let days = 1;
  if (r === "7d") { from.setDate(to.getDate() - 6); days = 7; }
  else if (r === "30d") { from.setDate(to.getDate() - 29); days = 30; }
  else if (r === "90d") { from.setDate(to.getDate() - 89); days = 90; }
  else if (r === "mtd") { from.setDate(1); days = to.getDate(); }
  else if (r === "ytd") { from.setMonth(0, 1); days = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1; }
  const prevTo = new Date(from); prevTo.setMilliseconds(-1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - days + 1); prevFrom.setHours(0, 0, 0, 0);
  return { from, to, prevFrom, prevTo, days };
}

const inr = (n: number) =>
  "₹" + (Math.abs(n) >= 1e7
    ? (n / 1e7).toFixed(2) + " Cr"
    : Math.abs(n) >= 1e5
    ? (n / 1e5).toFixed(2) + " L"
    : n.toLocaleString("en-IN", { maximumFractionDigits: 0 }));

export function InventoryOwnerDashboard() {
  const [range, setRange] = useState<Range>("30d");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const w = useMemo(() => rangeWindow(range), [range]);

  // ===== queries =====
  const balancesQ = useQuery({ queryKey: ["dash2", "balances"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_stock_balances" as never).select("location_type,location_id,item_id,size_value,qty");
    if (error) throw error; return (data as unknown as Balance[]) ?? [];
  }});
  const itemsQ = useQuery({ queryKey: ["dash2", "items"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_items" as never).select("id,item_code,name,default_reorder_level,is_sized,standard_cost,category_id");
    if (error) throw error; return (data as unknown as Item[]) ?? [];
  }});
  const catsQ = useQuery({ queryKey: ["dash2", "cats"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_item_categories" as never).select("id,name");
    if (error) throw error; return (data as unknown as Category[]) ?? [];
  }});
  const sizesQ = useQuery({ queryKey: ["dash2", "sizes"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_item_sizes" as never).select("item_id,size_value,reorder_level");
    if (error) throw error; return (data as unknown as ItemSize[]) ?? [];
  }});
  const vendorsQ = useQuery({ queryKey: ["dash2", "vendors"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_vendors" as never).select("id,name,vendor_code,city");
    if (error) throw error; return (data as unknown as Vendor[]) ?? [];
  }});
  const rateCardsQ = useQuery({ queryKey: ["dash2", "rate-cards"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).select("vendor_id,item_id,size_value,unit_price").eq("enabled", true);
    if (error) throw error; return (data as unknown as RateCard[]) ?? [];
  }});
  const poQ = useQuery({ queryKey: ["dash2", "pos"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_purchase_orders" as never).select("id,po_number,vendor_id,status,po_date,grand_total,destination_warehouse_id");
    if (error) throw error; return (data as unknown as PO[]) ?? [];
  }});
  const poLinesQ = useQuery({ queryKey: ["dash2", "po-lines"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_po_lines" as never).select("po_id,item_id,ordered_qty,accepted_qty,line_total,unit_price");
    if (error) throw error; return (data as unknown as POLine[]) ?? [];
  }});
  const candsQ = useQuery({ queryKey: ["dash2", "cands"], queryFn: async () => {
    const { data, error } = await supabase.from("candidates").select("id,full_name,employee_code,role_key,designation_id").in("status", ["approved", "active"]);
    if (error) throw error; return (data as unknown as Cand[]) ?? [];
  }});
  const desigQ = useQuery({ queryKey: ["dash2", "desig"], queryFn: async () => {
    const { data, error } = await supabase.from("designations").select("id,name");
    if (error) throw error; return (data as unknown as Designation[]) ?? [];
  }});
  const branchesQ = useQuery({ queryKey: ["dash2", "branches"], queryFn: async () => {
    const { data, error } = await supabase.from("branches").select("id,name,code");
    if (error) throw error; return (data as unknown as Branch[]) ?? [];
  }});
  const grnQ = useQuery({ queryKey: ["dash2", "grns"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_goods_receipts" as never).select("id,receipt_date,po_id,vendor_id,status");
    if (error) throw error; return (data as unknown as GRN[]) ?? [];
  }});
  const woQ = useQuery({ queryKey: ["dash2", "wo"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_write_offs" as never).select("id,writeoff_date,recovery_amount,status");
    if (error) throw error; return (data as unknown as WriteOff[]) ?? [];
  }});
  const whsQ = useQuery({ queryKey: ["dash2", "whs"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name,warehouse_code");
    if (error) throw error; return (data as unknown as { id: string; name: string; warehouse_code: string }[]) ?? [];
  }});
  const transfersQ = useQuery({ queryKey: ["dash2", "transfers"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_transfers" as never).select("id,status");
    if (error) throw error; return (data as unknown as { id: string; status: string }[]) ?? [];
  }});
  const issuancesQ = useQuery({ queryKey: ["dash2", "issuances"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_issuances" as never).select("id,status");
    if (error) throw error; return (data as unknown as { id: string; status: string }[]) ?? [];
  }});
  const adjustmentsQ = useQuery({ queryKey: ["dash2", "adjustments"], queryFn: async () => {
    const { data, error } = await supabase.from("inv_adjustments" as never).select("id,status");
    if (error) throw error; return (data as unknown as { id: string; status: string }[]) ?? [];
  }});

  const items = itemsQ.data ?? [];
  const cats = catsQ.data ?? [];
  const sizes = sizesQ.data ?? [];
  const balances = balancesQ.data ?? [];
  const vendors = vendorsQ.data ?? [];
  const rateCards = rateCardsQ.data ?? [];
  const pos = poQ.data ?? [];
  const poLines = poLinesQ.data ?? [];
  const cands = candsQ.data ?? [];
  const desigs = desigQ.data ?? [];
  const branches = branchesQ.data ?? [];
  const grns = grnQ.data ?? [];
  const wos = woQ.data ?? [];
  const whs = whsQ.data ?? [];
  const transfers = transfersQ.data ?? [];
  const issuances = issuancesQ.data ?? [];
  const adjustments = adjustmentsQ.data ?? [];
  const { can } = useCurrentPermissions();

  const totalStockQty = useMemo(() => balances.reduce((s, b) => s + Math.max(0, Number(b.qty || 0)), 0), [balances]);
  const recoveryCur = useMemo(() => wos.filter((x) => new Date(x.writeoff_date) >= w.from && new Date(x.writeoff_date) <= w.to).reduce((s, x) => s + Number(x.recovery_amount || 0), 0), [wos, w]);
  const poSplit = useMemo(() => {
    const open = pos.filter((p) => ["draft", "approved", "partial", "open", "partially_received"].includes(p.status)).length;
    const closed = pos.filter((p) => ["received", "closed"].includes(p.status)).length;
    return { total: pos.length, open, closed };
  }, [pos]);
  const grnSplit = useMemo(() => {
    const received = grns.filter((g) => g.status === "received" || g.status === "draft").length;
    const posted = grns.filter((g) => g.status === "posted").length;
    return { total: grns.length, received, posted };
  }, [grns]);
  const transferSplit = useMemo(() => {
    const inTransit = transfers.filter((t) => ["in_transit", "dispatched"].includes(t.status)).length;
    const ack = transfers.filter((t) => ["acknowledged", "received"].includes(t.status)).length;
    return { total: transfers.length, inTransit, ack };
  }, [transfers]);
  const issuanceSplit = useMemo(() => {
    const issued = issuances.filter((i) => i.status === "issued").length;
    const ack = issuances.filter((i) => i.status === "acknowledged").length;
    return { total: issuances.length, issued, ack };
  }, [issuances]);
  const woSplit = useMemo(() => {
    const pending = wos.filter((x) => x.status === "pending" || x.status === "draft").length;
    const approved = wos.filter((x) => x.status === "approved").length;
    return { total: wos.length, pending, approved };
  }, [wos]);
  const adjSplit = useMemo(() => {
    const draft = adjustments.filter((a) => a.status === "draft").length;
    const posted = adjustments.filter((a) => a.status === "posted").length;
    return { total: adjustments.length, draft, posted };
  }, [adjustments]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const candMap = useMemo(() => new Map(cands.map((c) => [c.id, c])), [cands]);
  const desigMap = useMemo(() => new Map(desigs.map((d) => [d.id, d])), [desigs]);
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  // Items respecting category filter
  const itemPasses = (id: string) => {
    if (categoryFilter === "all") return true;
    return itemMap.get(id)?.category_id === categoryFilter;
  };
  const balPasses = (b: Balance) => {
    if (!itemPasses(b.item_id)) return false;
    if (warehouseFilter === "all") return true;
    return b.location_type === "warehouse" ? b.location_id === warehouseFilter : true;
  };

  // ===== KPIs =====
  const stockValue = useMemo(() => {
    let v = 0;
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id);
      if (!it) continue;
      v += Number(b.qty) * Number(it.standard_cost || 0);
    }
    return v;
  }, [balances, itemMap, categoryFilter, warehouseFilter]);

  const inPeriod = (d: string | Date) => {
    const x = new Date(d);
    return x >= w.from && x <= w.to;
  };
  const inPrevPeriod = (d: string | Date) => {
    const x = new Date(d);
    return x >= w.prevFrom && x <= w.prevTo;
  };

  const spendCur = useMemo(() => pos.filter((p) => inPeriod(p.po_date)).reduce((s, p) => s + Number(p.grand_total || 0), 0), [pos, w]);
  const spendPrev = useMemo(() => pos.filter((p) => inPrevPeriod(p.po_date)).reduce((s, p) => s + Number(p.grand_total || 0), 0), [pos, w]);
  const posInPeriod = useMemo(() => pos.filter((p) => inPeriod(p.po_date)).length, [pos, w]);
  const posPrev = useMemo(() => pos.filter((p) => inPrevPeriod(p.po_date)).length, [pos, w]);
  const grnsInPeriod = useMemo(() => grns.filter((g) => inPeriod(g.receipt_date)).length, [grns, w]);
  const grnsPrev = useMemo(() => grns.filter((g) => inPrevPeriod(g.receipt_date)).length, [grns, w]);
  const openPOs = pos.filter((p) => ["draft", "approved", "partial"].includes(p.status)).length;
  const writeoffCur = useMemo(() => wos.filter((x) => inPeriod(x.writeoff_date)).reduce((s, x) => s + Number(x.recovery_amount || 0), 0), [wos, w]);

  // Low stock
  const lowStock = useMemo(() => {
    const grouped = new Map<string, { item_id: string; size_value: string; total: number }>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
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
      if (reorder > 0 && g.total <= reorder) rows.push({ item, size_value: g.size_value, qty: g.total, reorder });
    }
    // Also include items with zero balance everywhere (no record but reorder>0)
    return rows.sort((a, b) => a.qty / Math.max(1, a.reorder) - b.qty / Math.max(1, b.reorder));
  }, [balances, sizes, itemMap, categoryFilter, warehouseFilter]);

  // Cheapest vendor per item
  const cheapestPerItem = useMemo(() => {
    const map = new Map<string, { vendor_id: string; unit_price: number; count: number }>();
    for (const rc of rateCards) {
      if (!itemPasses(rc.item_id)) continue;
      const cur = map.get(rc.item_id);
      if (!cur) map.set(rc.item_id, { vendor_id: rc.vendor_id, unit_price: rc.unit_price, count: 1 });
      else {
        cur.count += 1;
        if (rc.unit_price < cur.unit_price) { cur.vendor_id = rc.vendor_id; cur.unit_price = rc.unit_price; }
      }
    }
    return Array.from(map.entries()).map(([item_id, v]) => ({
      item: itemMap.get(item_id), vendor: vendorMap.get(v.vendor_id), unit_price: v.unit_price, vendor_count: v.count,
    })).filter((r) => r.item && r.vendor);
  }, [rateCards, itemMap, vendorMap, categoryFilter]);

  // Vendor spend (period)
  const vendorSpend = useMemo(() => {
    const poVendor = new Map(pos.filter((p) => inPeriod(p.po_date)).map((p) => [p.id, { vendor_id: p.vendor_id, total: Number(p.grand_total || 0) }]));
    const tally = new Map<string, number>();
    for (const [, v] of poVendor) tally.set(v.vendor_id, (tally.get(v.vendor_id) ?? 0) + v.total);
    return Array.from(tally.entries())
      .map(([vid, total]) => ({ vendor: vendorMap.get(vid), total }))
      .filter((r) => r.vendor)
      .sort((a, b) => b.total - a.total);
  }, [pos, vendorMap, w]);

  // Spend over time (chart)
  const spendSeries = useMemo(() => {
    const buckets = new Map<string, { date: string; spend: number; orders: number }>();
    const days = Math.max(1, Math.ceil((w.to.getTime() - w.from.getTime()) / 86400000) + 1);
    for (let i = 0; i < days; i++) {
      const d = new Date(w.from); d.setDate(w.from.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      buckets.set(k, { date: k, spend: 0, orders: 0 });
    }
    for (const p of pos) {
      if (!inPeriod(p.po_date)) continue;
      const k = new Date(p.po_date).toISOString().slice(0, 10);
      const cur = buckets.get(k);
      if (cur) { cur.spend += Number(p.grand_total || 0); cur.orders += 1; }
    }
    return Array.from(buckets.values());
  }, [pos, w]);

  // Top items by current stock value
  const topItems = useMemo(() => {
    const tally = new Map<string, { item: Item; qty: number; value: number }>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id); if (!it) continue;
      const cur = tally.get(b.item_id) ?? { item: it, qty: 0, value: 0 };
      cur.qty += Number(b.qty); cur.value += Number(b.qty) * Number(it.standard_cost || 0);
      tally.set(b.item_id, cur);
    }
    return Array.from(tally.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [balances, itemMap, categoryFilter, warehouseFilter]);

  // Category split
  const catSplit = useMemo(() => {
    const tally = new Map<string, number>();
    for (const b of balances) {
      if (!balPasses(b)) continue;
      const it = itemMap.get(b.item_id); if (!it) continue;
      const cName = (it.category_id && catMap.get(it.category_id)) || "Uncategorised";
      tally.set(cName, (tally.get(cName) ?? 0) + Number(b.qty) * Number(it.standard_cost || 0));
    }
    return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
  }, [balances, itemMap, catMap, categoryFilter, warehouseFilter]);

  // Holdings — per location, with item breakdown
  type HoldingLine = { item_id: string; item_name: string; item_code: string; size_value: string; qty: number; value: number };
  type HoldingEntry = { id: string; qty: number; value: number; lines: HoldingLine[] };
  const buildHoldings = (locType: string): HoldingEntry[] => {
    const byLoc = new Map<string, Map<string, HoldingLine>>();
    for (const b of balances) {
      if (b.location_type !== locType) continue;
      if (!itemPasses(b.item_id)) continue;
      if (Number(b.qty) <= 0) continue;
      const it = itemMap.get(b.item_id);
      if (!it) continue;
      const key = `${b.item_id}|${b.size_value}`;
      const m = byLoc.get(b.location_id) ?? new Map<string, HoldingLine>();
      const cur = m.get(key) ?? {
        item_id: b.item_id,
        item_name: it.name,
        item_code: it.item_code,
        size_value: b.size_value,
        qty: 0,
        value: 0,
      };
      cur.qty += Number(b.qty);
      cur.value += Number(b.qty) * Number(it.standard_cost || 0);
      m.set(key, cur);
      byLoc.set(b.location_id, m);
    }
    return Array.from(byLoc.entries()).map(([id, m]) => {
      const lines = Array.from(m.values()).sort((a, b) => b.qty - a.qty);
      return {
        id,
        qty: lines.reduce((s, l) => s + l.qty, 0),
        value: lines.reduce((s, l) => s + l.value, 0),
        lines,
      };
    }).sort((a, b) => b.qty - a.qty);
  };
  const guardHoldings = useMemo(() => buildHoldings("guard"), [balances, itemMap, categoryFilter, warehouseFilter]);
  const foHoldings = useMemo(() => buildHoldings("field_officer"), [balances, itemMap, categoryFilter, warehouseFilter]);
  const branchHoldings = useMemo(() => buildHoldings("branch"), [balances, itemMap, categoryFilter, warehouseFilter]);


  // Recent activity
  const recent = useMemo(() => {
    const events: { ts: string; type: string; label: string; value?: string; href: string }[] = [];
    for (const p of pos) events.push({ ts: p.po_date, type: "PO", label: `${p.po_number} · ${vendorMap.get(p.vendor_id)?.name ?? "vendor"}`, value: inr(Number(p.grand_total || 0)), href: "/admin/inventory/purchase-orders" });
    for (const g of grns) events.push({ ts: g.receipt_date, type: "GRN", label: `Goods received`, href: "/admin/inventory/goods-receipts" });
    for (const x of wos) events.push({ ts: x.writeoff_date, type: "Write-off", label: `Write-off ${x.status}`, value: x.recovery_amount > 0 ? inr(Number(x.recovery_amount)) : undefined, href: "/admin/inventory/write-offs" });
    return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10);
  }, [pos, grns, wos, vendorMap]);

  const filter = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/60 p-3 backdrop-blur">
        <div className="flex items-center gap-1 rounded-xl bg-secondary/40 p-1">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${range === r ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{RANGE_LABEL[r]}</button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Warehouse" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warehouses</SelectItem>
              {whs.map((wh) => <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-[200px]" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Stock Value" value={inr(stockValue)} icon={Wallet} tint="from-emerald-500/15 to-emerald-500/0" iconClass="text-emerald-500" hint="On-hand at standard cost" />
        <Kpi label={`Spend · ${RANGE_LABEL[range]}`} value={inr(spendCur)} delta={delta(spendCur, spendPrev)} icon={IndianRupee} tint="from-violet-500/15 to-violet-500/0" iconClass="text-violet-500" />
        <Kpi label="POs Raised" value={posInPeriod.toString()} delta={delta(posInPeriod, posPrev)} icon={ShoppingCart} tint="from-blue-500/15 to-blue-500/0" iconClass="text-blue-500" />
        <Kpi label="GRNs Posted" value={grnsInPeriod.toString()} delta={delta(grnsInPeriod, grnsPrev)} icon={Truck} tint="from-cyan-500/15 to-cyan-500/0" iconClass="text-cyan-500" />
        <Kpi label="Low Stock Lines" value={lowStock.length.toString()} icon={AlertTriangle} tint="from-amber-500/15 to-amber-500/0" iconClass="text-amber-500" hint={`${openPOs} open POs · ${inr(writeoffCur)} write-offs`} />
      </div>

      {/* Overview — clickable totals across modules */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <div className="font-display text-sm font-bold tracking-tight">Overview</div>
          <div className="text-[11px] text-muted-foreground">Click any tile to open the module</div>
        </div>

        {/* Master counts */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {can("item_master") && <CountTile to="/admin/inventory/items" label="Products" value={items.length} icon={PackageOpen} accent="text-violet-500" />}
          {can("vendors") && <CountTile to="/admin/inventory/vendors" label="Vendors" value={vendors.length} icon={ShoppingCart} accent="text-blue-500" />}
          {can("warehouses") && <CountTile to="/admin/inventory/warehouses" label="Warehouses" value={whs.length} icon={Warehouse} accent="text-amber-500" />}
          {can("stock_report") && <CountTile to="/admin/inventory/stock" label="Branches" value={branches.length} icon={Building2} accent="text-cyan-500" />}
        </div>

        {/* Workflow counts with status split */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {can("purchase_orders") && (
            <WorkflowTile to="/admin/inventory/purchase-orders" label="Purchase Orders" value={poSplit.total} icon={FileText} accent="text-blue-500"
              chips={[{ label: "Open", value: poSplit.open, tone: "amber" }, { label: "Closed", value: poSplit.closed, tone: "emerald" }]} />
          )}
          {can("goods_receipts") && (
            <WorkflowTile to="/admin/inventory/goods-receipts" label="Delivery Challans" value={grnSplit.total} icon={ClipboardList} accent="text-cyan-500"
              chips={[{ label: "Received", value: grnSplit.received, tone: "amber" }, { label: "Posted", value: grnSplit.posted, tone: "emerald" }]} />
          )}
          {can("transfers") && (
            <WorkflowTile to="/admin/inventory/transfers" label="Transfers" value={transferSplit.total} icon={Truck} accent="text-violet-500"
              chips={[{ label: "In Transit", value: transferSplit.inTransit, tone: "amber" }, { label: "Ack.", value: transferSplit.ack, tone: "emerald" }]} />
          )}
          {can("issuances") && (
            <WorkflowTile to="/admin/inventory/issuances" label="Issuances" value={issuanceSplit.total} icon={UserPlus} accent="text-teal-500"
              chips={[{ label: "Issued", value: issuanceSplit.issued, tone: "amber" }, { label: "Ack.", value: issuanceSplit.ack, tone: "emerald" }]} />
          )}
          {can("write_offs") && (
            <WorkflowTile to="/admin/inventory/write-offs" label="Write-offs" value={woSplit.total} icon={ShieldCheck} accent="text-rose-500"
              chips={[{ label: "Pending", value: woSplit.pending, tone: "amber" }, { label: "Approved", value: woSplit.approved, tone: "emerald" }]} />
          )}
          {can("adjustments") && (
            <WorkflowTile to="/admin/inventory/adjustments" label="Adjustments" value={adjSplit.total} icon={SlidersHorizontal} accent="text-amber-500"
              chips={[{ label: "Draft", value: adjSplit.draft, tone: "amber" }, { label: "Posted", value: adjSplit.posted, tone: "emerald" }]} />
          )}
        </div>

        {/* Money + stock hero */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {can("stock_report") && <HeroTile to="/admin/inventory/stock" label="Total Stock Value" value={inr(stockValue)} icon={Wallet} accent="text-emerald-500" />}
          {can("stock_report") && <HeroTile to="/admin/inventory/stock" label="Total Stock Qty" value={totalStockQty.toLocaleString("en-IN")} icon={Boxes} accent="text-cyan-500" />}
          {can("purchase_orders") && <HeroTile to="/admin/inventory/purchase-orders" label={`Procurement Spend · ${RANGE_LABEL[range]}`} value={inr(spendCur)} icon={IndianRupee} tone="text-violet-500" accent="text-violet-500" />}
          {can("write_offs") && <HeroTile to="/admin/inventory/write-offs" label={`Recovery · ${RANGE_LABEL[range]}`} value={inr(recoveryCur)} icon={Wallet} accent="text-rose-500" />}
        </div>
      </div>


      {/* Holdings — who holds what, click for breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HoldingsCard
          title="Branch Holdings"
          icon={Building2}
          accent="text-blue-500"
          rows={branchHoldings.map((r) => {
            const b = branchMap.get(r.id);
            return {
              name: b ? `${b.code} · ${b.name}` : r.id.slice(0, 8),
              meta: `${r.lines.length} line${r.lines.length !== 1 ? "s" : ""}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
        <HoldingsCard
          title="Field Officers"
          icon={Users}
          accent="text-violet-500"
          rows={foHoldings.map((r) => {
            const c = candMap.get(r.id);
            return {
              name: c?.full_name ?? r.id.slice(0, 8),
              meta: `${c?.employee_code ?? ""} · ${desigMap.get(c?.designation_id ?? "")?.name ?? "Field Officer"}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
        <HoldingsCard
          title="Guards"
          icon={ShieldCheck}
          accent="text-teal-500"
          rows={guardHoldings.map((r) => {
            const c = candMap.get(r.id);
            return {
              name: c?.full_name ?? r.id.slice(0, 8),
              meta: `${c?.employee_code ?? ""} · ${desigMap.get(c?.designation_id ?? "")?.name ?? "Guard"}`,
              qty: r.qty,
              value: r.value,
              lines: r.lines,
            };
          })}
        />
      </div>



      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Spend Trend" subtitle={RANGE_LABEL[range]} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="sp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [inr(v), "Spend"]}
                />
                <Area type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#sp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Stock Value by Category">
          <div className="h-64">
            {catSplit.length === 0 ? <Empty>No stock yet.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {catSplit.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number) => inr(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      {/* Top items + Vendor leaderboard */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top Items by Stock Value" className="lg:col-span-2">
          <div className="h-72">
            {topItems.length === 0 ? <Empty>No stock yet.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItems.map((t) => ({ name: t.item.name, qty: t.qty, value: t.value }))} layout="vertical" margin={{ left: 30, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number, k) => k === "value" ? [inr(v), "Value"] : [v.toLocaleString("en-IN"), "Qty"]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel title="Vendor Leaderboard" subtitle={`PO spend · ${RANGE_LABEL[range]}`}>
          {vendorSpend.length === 0 ? <Empty>No purchase orders in period.</Empty> : (
            <div className="space-y-2">
              {vendorSpend.slice(0, 7).map((r, i) => {
                const max = vendorSpend[0].total || 1;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">{i + 1}</span>
                        <Link to="/admin/inventory/vendors" className="font-medium hover:underline">{r.vendor!.name}</Link>
                        <span className="text-xs text-muted-foreground">{r.vendor!.city}</span>
                      </span>
                      <span className="tabular-nums font-semibold">{inr(r.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary/40">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${(r.total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Low stock + Cheapest vendor */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Low Stock Alerts" subtitle="Warehouse + Branch combined" right={<Link to="/admin/inventory/stock" className="text-xs text-primary hover:underline flex items-center gap-1">View stock <ArrowRight className="h-3 w-3" /></Link>}>
          {lowStock.length === 0 ? <Empty>Healthy — no items at reorder.</Empty> : (
            <DataTable head={["Item", "Size", "On Hand", "Reorder", ""]}>
              {lowStock.filter((r) => filter(r.item.name) || filter(r.item.item_code)).slice(0, 8).map((r, i) => {
                const ratio = r.qty / Math.max(1, r.reorder);
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2"><div className="font-medium">{r.item.name}</div><div className="text-xs text-muted-foreground">{r.item.item_code}</div></td>
                    <td className="p-2 text-muted-foreground">{r.size_value || "—"}</td>
                    <td className="p-2 tabular-nums font-semibold">{r.qty}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{r.reorder}</td>
                    <td className="p-2"><Badge variant={ratio < 0.25 ? "destructive" : "secondary"}>{ratio < 0.25 ? "Critical" : "Low"}</Badge></td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Panel>

        <Panel title="Cheapest Vendor per Item" subtitle="From active rate cards" right={<Link to="/admin/inventory/rate-cards" className="text-xs text-primary hover:underline flex items-center gap-1">Rate cards <ArrowRight className="h-3 w-3" /></Link>}>
          {cheapestPerItem.length === 0 ? <Empty>No rate cards configured.</Empty> : (
            <DataTable head={["Item", "Best Vendor", "Unit Price", "Quotes"]}>
              {cheapestPerItem.filter((r) => filter(r.item!.name) || filter(r.vendor!.name)).slice(0, 8).map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="p-2"><div className="font-medium">{r.item!.name}</div><div className="text-xs text-muted-foreground">{r.item!.item_code}</div></td>
                  <td className="p-2 text-muted-foreground">{r.vendor!.name}</td>
                  <td className="p-2 tabular-nums font-semibold text-emerald-600">₹{r.unit_price.toLocaleString("en-IN")}</td>
                  <td className="p-2 tabular-nums text-muted-foreground">{r.vendor_count}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>


      {/* Activity */}
      <Panel title="Recent Activity" subtitle="Latest POs, GRNs, write-offs">
        {recent.length === 0 ? <Empty>No activity yet.</Empty> : (
          <div className="space-y-1">
            {recent.map((e, i) => (
              <Link key={i} to={e.href} className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/40 transition">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50">
                  {e.type === "PO" ? <ShoppingCart className="h-4 w-4 text-blue-500" /> : e.type === "GRN" ? <Truck className="h-4 w-4 text-cyan-500" /> : <Package className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{e.label}</div>
                  <div className="text-xs text-muted-foreground">{e.type} · {new Date(e.ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
                {e.value && <div className="text-sm font-semibold tabular-nums">{e.value}</div>}
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ============= helpers =============
function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 70% 60%)",
  "hsl(160 70% 45%)",
  "hsl(280 70% 60%)",
  "hsl(30 90% 55%)",
  "hsl(340 75% 55%)",
];

function Kpi({ label, value, delta, icon: Icon, tint, iconClass, hint }: {
  label: string; value: string; delta?: number; icon: React.ComponentType<{ className?: string }>;
  tint: string; iconClass: string; hint?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${tint} p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
          {delta !== undefined ? (
            <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-rose-600"}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(0)}% vs prev period
            </div>
          ) : hint ? (
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-background/60 backdrop-blur ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, right, children, className = "" }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold tracking-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

type HoldingRow = {
  name: string;
  meta: string;
  qty: number;
  value: number;
  lines: { item_id: string; item_name: string; item_code: string; size_value: string; qty: number; value: number }[];
};

function HoldingsCard({ title, icon: Icon, accent, rows }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  rows: HoldingRow[];
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const active = openIdx !== null ? rows[openIdx] : null;
  return (
    <Panel title={title} subtitle={`${rows.length} holders · ${total.toLocaleString("en-IN")} units`}>
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/40 ${accent}`}><Icon className="h-4 w-4" /></div>
      {rows.length === 0 ? <Empty>Nothing in hand.</Empty> : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpenIdx(i)}
              className="flex w-full items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-left transition hover:border-accent/50 hover:bg-accent/5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.meta}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                <Boxes className="h-3.5 w-3.5 text-muted-foreground" />{r.qty.toLocaleString("en-IN")}
                <ArrowRight className="ml-1 h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
            </button>
          ))}
          {rows.length > 6 && (
            <div className="pt-1 text-center text-[11px] text-muted-foreground">+ {rows.length - 6} more</div>
          )}
        </div>
      )}

      <Dialog open={openIdx !== null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/40 ${accent}`}>
                <Icon className="h-4 w-4" />
              </span>
              {active?.name}
            </DialogTitle>
            <DialogDescription>
              {active?.meta} · {active?.qty.toLocaleString("en-IN")} units · {active ? inr(active.value) : ""}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="max-h-[60vh] overflow-auto">
              <DataTable head={["Item", "Code", "Size", "Qty", "Value"]}>
                {active.lines.map((l, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-2 font-medium">{l.item_name}</td>
                    <td className="p-2 text-xs text-muted-foreground">{l.item_code}</td>
                    <td className="p-2 text-muted-foreground">{l.size_value || "—"}</td>
                    <td className="p-2 tabular-nums font-semibold">{l.qty.toLocaleString("en-IN")}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{inr(l.value)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}


function DataTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border/60">
      <table className="ios-table w-full text-sm">
        <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className="p-2 text-left font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function CountTile({ to, label, value, icon: Icon, accent }: { to: string; label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-accent/5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/50 ${accent}`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display text-xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

function HeroTile({ to, label, value, icon: Icon, accent }: { to: string; label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent: string; tone?: string }) {
  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-accent/5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/50 ${accent}`}><Icon className="h-4 w-4" /></div>
      </div>
    </Link>
  );
}

function WorkflowTile({ to, label, value, icon: Icon, accent, chips }: {
  to: string; label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string;
  chips: { label: string; value: number; tone: "amber" | "emerald" }[];
}) {
  const toneCls = (t: "amber" | "emerald") => t === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return (
    <Link to={to} className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-accent/5">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/50 ${accent}`}><Icon className="h-4 w-4" /></div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display text-xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneCls(c.tone)}`}>
            {c.label} <span className="tabular-nums">{c.value}</span>
          </span>
        ))}
      </div>
    </Link>
  );
}

