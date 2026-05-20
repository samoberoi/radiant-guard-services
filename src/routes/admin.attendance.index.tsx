import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ArrowRight, ClipboardList, Users, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/attendance/")({
  component: AttendanceUnitsPage,
});

type UnitRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  customer_name: string;
  contract_codes: string[];
  contract_end: string | null;
  employee_count: number;
};

function AttendanceUnitsPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-units-v2"],
    queryFn: async (): Promise<UnitRow[]> => {
      const { data: contracts, error: cErr } = await supabase
        .from("client_contracts")
        .select("unit_id, contract_code, end_date, status, approval_status")
        .eq("status", "active");
      if (cErr) throw cErr;

      const byUnit = new Map<string, { codes: string[]; end: string | null }>();
      for (const c of contracts ?? []) {
        if (!c.unit_id) continue;
        const prev = byUnit.get(c.unit_id) ?? { codes: [], end: null };
        if (c.contract_code) prev.codes.push(c.contract_code);
        if (!prev.end || (c.end_date && c.end_date > prev.end)) prev.end = c.end_date;
        byUnit.set(c.unit_id, prev);
      }
      const unitIds = Array.from(byUnit.keys());
      if (unitIds.length === 0) return [];

      const [{ data: units }, { data: cands }] = await Promise.all([
        supabase
          .from("units")
          .select("id, code, name, location, customer_id")
          .in("id", unitIds),
        supabase
          .from("candidates")
          .select("id, unit_id")
          .in("unit_id", unitIds)
          .eq("is_enabled", true)
          .eq("status", "approved"),
      ]);

      const empCount = new Map<string, number>();
      for (const c of cands ?? []) {
        if (!c.unit_id) continue;
        empCount.set(c.unit_id, (empCount.get(c.unit_id) ?? 0) + 1);
      }

      const custIds = Array.from(
        new Set((units ?? []).map((u) => u.customer_id).filter(Boolean)),
      ) as string[];
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", custIds.length ? custIds : ["00000000-0000-0000-0000-000000000000"]);
      const custMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

      return (units ?? [])
        .map((u) => ({
          id: u.id,
          code: u.code,
          name: u.name,
          location: u.location || "",
          customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
          contract_codes: byUnit.get(u.id)?.codes ?? [],
          contract_end: byUnit.get(u.id)?.end ?? null,
          employee_count: empCount.get(u.id) ?? 0,
        }))
        .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.code.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        r.location.toLowerCase().includes(s) ||
        r.customer_name.toLowerCase().includes(s) ||
        r.contract_codes.some((c) => c.toLowerCase().includes(s)),
    );
  }, [q, data]);

  const totalEmployees = (data ?? []).reduce((s, u) => s + u.employee_count, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Attendance"
        description="Every unit with an active contract is listed below. Click one to open its monthly muster roll."
        crumbs={[{ label: "Attendance" }]}
      />

      {/* Stat strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Building2}
          label="Active units"
          value={(data ?? []).length}
        />
        <StatTile
          icon={FileText}
          label="Active contracts"
          value={(data ?? []).reduce((s, u) => s + u.contract_codes.length, 0)}
        />
        <StatTile icon={Users} label="Mapped employees" value={totalEmployees} />
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by unit, code, organization, or contract"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border/60 p-10 text-center text-sm text-muted-foreground">
          Loading units…
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No units with active contracts yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No units match “{q}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <Link
              key={u.id}
              to="/admin/attendance/$unitId"
              params={{ unitId: u.id }}
              className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{u.customer_name}</span>
                  </div>
                  <div className="mt-1 truncate text-base font-semibold leading-tight text-foreground">
                    {u.name || u.code}
                  </div>
                  {u.location && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {u.location}
                    </div>
                  )}
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-medium text-foreground">
                  {u.code}
                </span>
                {u.contract_codes.slice(0, 2).map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                  >
                    <FileText className="h-2.5 w-2.5" /> {c}
                  </span>
                ))}
                {u.contract_codes.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{u.contract_codes.length - 2} more
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{u.employee_count}</span>
                  <span>employees</span>
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5 text-accent" />
                  Open roll
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}
