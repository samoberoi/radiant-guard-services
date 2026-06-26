import { createFileRoute, Outlet, useLocation, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Boxes, LayoutDashboard, Tag, UserCheck, ArrowRight, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/office-assets")({
  component: OfficeAssetsLayout,
});

function OfficeAssetsLayout() {
  const loc = useLocation();
  const isHub = loc.pathname === "/admin/office-assets" || loc.pathname === "/admin/office-assets/";
  if (!isHub) return <Outlet />;
  return <OfficeAssetsDashboard />;
}

type Unit = { id: string; asset_id: string; branch_id: string | null; status: string; current_value: number | null; purchase_cost: number | null };
type Asset = { id: string; name: string; unit_cost: number };
type Branch = { id: string; name: string };

function OfficeAssetsDashboard() {
  const { data: units = [] } = useQuery({
    queryKey: ["oa-units-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("office_asset_units" as never).select("id,asset_id,branch_id,status,current_value,purchase_cost");
      if (error) throw error;
      return data as unknown as Unit[];
    },
  });
  const { data: assets = [] } = useQuery({
    queryKey: ["oa-assets-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("office_assets" as never).select("id,name,unit_cost");
      if (error) throw error;
      return data as unknown as Asset[];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-lite-oa"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches" as never).select("id,name").order("name");
      if (error) throw error;
      return data as unknown as Branch[];
    },
  });

  const assetCost = new Map(assets.map((a) => [a.id, Number(a.unit_cost) || 0]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const valueOf = (u: Unit) => Number(u.current_value ?? u.purchase_cost ?? assetCost.get(u.asset_id) ?? 0);

  const totalUnits = units.length;
  const allocated = units.filter((u) => u.status === "allocated").length;
  const totalValue = units.reduce((s, u) => s + valueOf(u), 0);
  const allocatedPct = totalUnits ? Math.round((allocated / totalUnits) * 100) : 0;

  const byBranch = new Map<string, { count: number; value: number; allocated: number }>();
  units.forEach((u) => {
    const key = u.branch_id ?? "_unassigned";
    const row = byBranch.get(key) ?? { count: 0, value: 0, allocated: 0 };
    row.count += 1;
    row.value += valueOf(u);
    if (u.status === "allocated") row.allocated += 1;
    byBranch.set(key, row);
  });
  const branchRows = Array.from(byBranch.entries())
    .map(([id, r]) => ({ id, name: id === "_unassigned" ? "Unassigned" : branchName.get(id) ?? "—", ...r }))
    .sort((a, b) => b.value - a.value);

  const tiles = [
    { to: "/admin/office-assets/inventory", label: "Inventory", desc: "Catalog & per-branch stock", icon: Boxes, color: "from-sky-500/15 to-sky-500/5 text-sky-700" },
    { to: "/admin/office-assets/allocations", label: "Allocations", desc: "Assign to non-billable staff", icon: UserCheck, color: "from-emerald-500/15 to-emerald-500/5 text-emerald-700" },
    { to: "/admin/office-assets/categories", label: "Categories", desc: "Manage asset taxonomy", icon: Tag, color: "from-violet-500/15 to-violet-500/5 text-violet-700" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Office Assets"
        description="Track laptops, furniture, peripherals & every company-owned office item — by branch and by person."
        crumbs={[{ label: "Office Assets" }]}
        icon={Briefcase}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Units" value={totalUnits.toLocaleString("en-IN")} icon={Boxes} tone="sky" />
        <KpiCard label="Inventory Value" value={`₹${Math.round(totalValue).toLocaleString("en-IN")}`} icon={LayoutDashboard} tone="emerald" />
        <KpiCard label="Allocated" value={`${allocated} (${allocatedPct}%)`} icon={UserCheck} tone="violet" />
        <KpiCard label="Branches Holding" value={branchRows.filter((r) => r.id !== "_unassigned").length.toString()} icon={Building2} tone="amber" />
      </div>

      {/* Action tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="group rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className={`mb-3 inline-grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${t.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.desc}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Branch holdings */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Branch Holdings</h2>
          <p className="text-xs text-muted-foreground">Inventory count & value per branch (sorted by value)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Branch</th>
                <th className="px-5 py-3 text-right">Units</th>
                <th className="px-5 py-3 text-right">Allocated</th>
                <th className="px-5 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branchRows.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No units yet — add some in Inventory.</td></tr>
              )}
              {branchRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.count}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.allocated}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">₹{Math.round(r.value).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: "sky" | "emerald" | "violet" | "amber" }) {
  const toneClass = {
    sky: "from-sky-500/15 to-sky-500/5 text-sky-700",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-700",
    violet: "from-violet-500/15 to-violet-500/5 text-violet-700",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-700",
  }[tone];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
