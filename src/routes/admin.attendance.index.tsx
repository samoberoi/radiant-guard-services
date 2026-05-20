import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ArrowRight } from "lucide-react";
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
  customer_name: string;
  contract_start: string | null;
  contract_end: string | null;
};

function AttendanceUnitsPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-units"],
    queryFn: async (): Promise<UnitRow[]> => {
      // Active contracts -> unit_ids
      const { data: contracts, error: cErr } = await supabase
        .from("client_contracts")
        .select("unit_id, start_date, end_date, status, record_type")
        .eq("record_type", "contract")
        .eq("status", "active");
      if (cErr) throw cErr;
      const unitIds = Array.from(new Set((contracts ?? []).map((c) => c.unit_id).filter(Boolean))) as string[];
      if (unitIds.length === 0) return [];

      const { data: units, error: uErr } = await supabase
        .from("units")
        .select("id, code, name, customer_id")
        .in("id", unitIds);
      if (uErr) throw uErr;

      const custIds = Array.from(new Set((units ?? []).map((u) => u.customer_id).filter(Boolean))) as string[];
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", custIds.length ? custIds : ["00000000-0000-0000-0000-000000000000"]);
      const custMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

      const cByUnit = new Map<string, { start: string | null; end: string | null }>();
      for (const c of contracts ?? []) {
        if (!c.unit_id) continue;
        const prev = cByUnit.get(c.unit_id);
        if (!prev) cByUnit.set(c.unit_id, { start: c.start_date, end: c.end_date });
      }

      return (units ?? []).map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
        contract_start: cByUnit.get(u.id)?.start ?? null,
        contract_end: cByUnit.get(u.id)?.end ?? null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.code.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        r.customer_name.toLowerCase().includes(s),
    );
  }, [q, data]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Attendance"
        description="Pick a unit to open its monthly muster roll (Form XVI)."
        crumbs={[{ label: "Attendance" }]}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by unit, code, or organization"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading units…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No units with active contracts yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <Link
              key={u.id}
              to="/admin/attendance/$unitId"
              params={{ unitId: u.id }}
              className="group relative flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-accent/60 hover:bg-accent/5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate">{u.customer_name}</span>
                </div>
                <div className="mt-1 truncate text-base font-semibold text-foreground">
                  {u.name || u.code}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">Unit code: {u.code}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
