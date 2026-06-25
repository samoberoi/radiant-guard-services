import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { HeroTile } from "@/components/HeroTile";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";

export const Route = createFileRoute("/admin/field-dashboard")({
  component: FieldOfficerDashboard,
});

type UnitNode = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  is_primary: boolean;
  guards: Array<{ id: string; full_name: string; mobile: string; designation: string }>;
};

function FieldOfficerDashboard() {
  const { roleKey, isSuperAdmin } = useCurrentPermissions();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      const email = data.user?.email ?? "";
      const m = email.match(/phone-(\d{10})@/);
      setPhone(m?.[1] ?? "");
    });
  }, []);

  // Redirect non-field-officers (super admin still allowed for testing)
  useEffect(() => {
    if (!isSuperAdmin && roleKey && roleKey !== "field_officer") {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [roleKey, isSuperAdmin, navigate]);

  const dashQ = useQuery({
    queryKey: ["field-officer-dashboard", phone, userId],
    enabled: !!phone,
    queryFn: async () => {
      // Resolve the officer's candidate row from their phone
      const { data: me } = await supabase
        .from("candidates")
        .select("id,full_name")
        .eq("mobile", phone)
        .maybeSingle();
      const meId = (me as { id?: string } | null)?.id ?? null;
      const meName = (me as { full_name?: string } | null)?.full_name ?? "";
      if (!meId) {
        return {
          meName,
          units: [] as UnitNode[],
          pendingMine: 0,
          rejectedMine: 0,
          guardsTotal: 0,
        };
      }

      // Units I cover — from employee_scope_assignments (modern) + legacy candidate_units
      const [scopeRes, cuRes] = await Promise.all([
        supabase
          .from("employee_scope_assignments")
          .select("scope_id,scope_type")
          .eq("candidate_id", meId)
          .eq("scope_type", "unit"),
        supabase
          .from("candidate_units")
          .select("unit_id,is_primary")
          .eq("candidate_id", meId),
      ]);
      const scopeUnitIds = ((scopeRes.data ?? []) as Array<{ scope_id: string }>).map((r) => r.scope_id);
      const legacyUnits = ((cuRes.data ?? []) as Array<{ unit_id: string; is_primary: boolean }>);
      const primaryMap = new Map(legacyUnits.map((r) => [r.unit_id, r.is_primary]));
      const unitIds = Array.from(new Set([...scopeUnitIds, ...legacyUnits.map((r) => r.unit_id)]));

      // Guards reporting to me (regardless of whether unit_id is set on the candidate)
      const { data: myGuards } = await supabase
        .from("candidates")
        .select("id,full_name,mobile,designation_id,unit_id,role_key,status,is_enabled,reports_to")
        .eq("reports_to", meId)
        .in("role_key", ["guard", "security_guard"])
        .eq("status", "active")
        .eq("is_enabled", true);
      const guardList = (myGuards ?? []) as Array<{ id: string; full_name: string; mobile: string; designation_id: string | null; unit_id: string | null }>;

      // Resolve guard unit via scope_assignments when candidates.unit_id is null
      const guardsMissingUnit = guardList.filter((g) => !g.unit_id).map((g) => g.id);
      const guardScopeUnit = new Map<string, string>();
      if (guardsMissingUnit.length) {
        const { data: gs } = await supabase
          .from("employee_scope_assignments")
          .select("candidate_id,scope_id,scope_type")
          .in("candidate_id", guardsMissingUnit)
          .eq("scope_type", "unit");
        for (const r of (gs ?? []) as Array<{ candidate_id: string; scope_id: string }>) {
          if (!guardScopeUnit.has(r.candidate_id)) guardScopeUnit.set(r.candidate_id, r.scope_id);
        }
      }
      // Also include the units those guards belong to
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? null;
        if (uid && !unitIds.includes(uid)) unitIds.push(uid);
      }

      if (unitIds.length === 0 && guardList.length === 0) {
        return { meName, units: [], pendingMine: 0, rejectedMine: 0, guardsTotal: 0 };
      }

      const [unitsRes, custRes, mineRes] = await Promise.all([
        unitIds.length
          ? supabase.from("units").select("id,code,name,customer_id").in("id", unitIds)
          : Promise.resolve({ data: [] as Array<{ id: string; code: string; name: string; customer_id: string | null }> }),
        supabase.from("customers").select("id,name"),
        userId
          ? supabase
              .from("candidates")
              .select("status")
              .eq("created_by", userId)
              .in("status", ["pending", "rejected"])
          : Promise.resolve({ data: [] as Array<{ status: string }> }),
      ]);

      const { data: desigs } = await supabase.from("designations").select("id,name");
      const desigMap = new Map(((desigs ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
      const custMap = new Map(((custRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      const guardsByUnit = new Map<string, UnitNode["guards"]>();
      const UNASSIGNED = "__unassigned__";
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? UNASSIGNED;
        const arr = guardsByUnit.get(uid) ?? [];
        arr.push({
          id: g.id,
          full_name: g.full_name,
          mobile: g.mobile,
          designation: (g.designation_id && desigMap.get(g.designation_id)) || "—",
        });
        guardsByUnit.set(uid, arr);
      }

      const units: UnitNode[] = ((unitsRes.data ?? []) as Array<{ id: string; code: string; name: string; customer_id: string | null }>).map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
        is_primary: primaryMap.get(u.id) ?? false,
        guards: guardsByUnit.get(u.id) ?? [],
      })).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

      // Surface guards whose unit could not be resolved as a synthetic row so FO sees them
      const orphaned = guardsByUnit.get(UNASSIGNED) ?? [];
      if (orphaned.length) {
        units.push({ id: UNASSIGNED, code: "—", name: "Unassigned guards", customer_name: "Map these guards to a unit", is_primary: false, guards: orphaned });
      }


      const mine = ((mineRes.data ?? []) as Array<{ status: string }>);
      return {
        meName,
        units,
        pendingMine: mine.filter((r) => r.status === "pending").length,
        rejectedMine: mine.filter((r) => r.status === "rejected").length,
        guardsTotal: units.reduce((s, u) => s + u.guards.length, 0),
      };
    },
  });

  const data = dashQ.data;
  const isLoading = dashQ.isLoading;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <HeroTile
        eyebrow="Field operations"
        title={data?.meName || "Welcome"}
        subtitle={phone ? `+91 ${phone}` : undefined}
        description="Your units and the guards reporting to you."
      />


      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={Warehouse} label="Units I cover" value={data?.units.length ?? 0} accent="from-cyan-500/20 to-cyan-500/5 text-cyan-600" />
        <StatCard icon={ShieldCheck} label="Guards on duty" value={data?.guardsTotal ?? 0} accent="from-emerald-500/20 to-emerald-500/5 text-emerald-600" />
      </div>


      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="border-b border-border/60 px-5 py-5">
          <h2 className="text-lg font-semibold text-foreground">Unit tree</h2>
          <p className="text-sm text-muted-foreground">Tap a unit to see the guards reporting to you there.</p>
        </div>
        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (data?.units ?? []).length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No units assigned to you yet. Ask HR to map you to your unit(s).
            </div>
          ) : (
            (data?.units ?? []).map((u) => <UnitRow key={u.id} unit={u} />)
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, to }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string; to?: string }) {
  const inner = (
    <>
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accent}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">{value.toLocaleString()}</div>
      {to && (
        <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Open <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </>
  );
  const cls = "group relative block overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md";
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function UnitRow({ unit }: { unit: UnitNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-secondary/30"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold">
              {unit.name}
              {unit.is_primary && (
                <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Primary</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{unit.customer_name} · <span className="font-mono">{unit.code}</span></div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{unit.guards.length} guard{unit.guards.length === 1 ? "" : "s"}</div>
      </button>
      {open && (
        <div className="border-t border-border/40 bg-secondary/20 px-5 py-3">
          {unit.guards.length === 0 ? (
            <div className="py-3 text-sm text-muted-foreground">No active guards on this unit yet.</div>
          ) : (
            <table className="ios-table min-w-full table-auto text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Designation</th><th className="py-2">Mobile</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {unit.guards.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 pr-4 font-medium">{g.full_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{g.designation}</td>
                    <td className="py-2 font-mono text-xs">{g.mobile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
