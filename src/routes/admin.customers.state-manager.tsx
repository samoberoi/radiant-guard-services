import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Flag, MapPin, Search } from "lucide-react";
import { csvJoin, downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIndianStates, type IndianState } from "@/lib/admin-data";

export const Route = createFileRoute("/admin/customers/state-manager")({
  component: StateManagerPage,
});

type KindFilter = "all" | "state" | "ut";

function StateManagerPage() {
  const { allIndianStates: rows, isLoading, toggleEnabled } = useIndianStates();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });
  }, [rows, query, kind]);

  const counts = useMemo(() => {
    const states = rows.filter((r) => r.kind === "state");
    const uts = rows.filter((r) => r.kind === "ut");
    return {
      states: states.length,
      uts: uts.length,
      enabled: rows.filter((r) => r.enabled).length,
    };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="State Manager"
        description="Canonical list of Indian States and Union Territories. Used by Professional Tax and other compliance modules."
        crumbs={[
          { label: "Organizations", to: "/admin/customers" },
          { label: "State Manager" },
        ]}
      />

      {/* Stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="States" value={counts.states} icon={Flag} />
        <StatCard label="Union Territories" value={counts.uts} icon={MapPin} />
        <StatCard label="Enabled" value={counts.enabled} icon={Flag} accent />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
            <TabsList className="h-10">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="state">States</TabsTrigger>
              <TabsTrigger value="ut">UTs</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button
          variant="outline"
          className="h-10 rounded-lg"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              "india-states",
              rows.map((r) => ({
                name: r.name,
                code: r.code,
                kind: r.kind === "state" ? "State" : "Union Territory",
                enabled: r.enabled ? "Yes" : "No",
              })),
              [
                { key: "name", header: "Name" },
                { key: "code", header: "Code" },
                { key: "kind", header: "Kind" },
                { key: "enabled", header: "Enabled" },
              ],
            )
          }
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
              {filtered.length}
            </span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">
              Total {filtered.length === 1 ? "row" : "rows"}
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground">
            {csvJoin([`${counts.states} states`, `${counts.uts} UTs`])}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Kind</th>
                <th className="px-5 py-3 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <StateRow
                  key={r.id}
                  row={r}
                  index={i + 1}
                  onToggle={async (next) => {
                    const ok = await confirmAction({
                      title: next ? "Enable state?" : "Disable state?",
                      description: next
                        ? `${r.name} will appear in pickers (e.g. Professional Tax).`
                        : `${r.name} will be hidden from pickers but existing records keep their value.`,
                      confirmText: next ? "Enable" : "Disable",
                    });
                    if (!ok) return false;
                    try {
                      await toggleEnabled(r.id, next);
                      toast.success(`${r.name} ${next ? "enabled" : "disabled"}`);
                      return true;
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Update failed");
                      return false;
                    }
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading…" : "No matches."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StateRow({
  row,
  index,
  onToggle,
}: {
  row: IndianState;
  index: number;
  onToggle: (next: boolean) => Promise<boolean>;
}) {
  return (
    <tr className="hover:bg-secondary/30">
      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{index}</td>
      <td className="px-5 py-3 font-medium text-foreground">{row.name}</td>
      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.code}</td>
      <td className="px-5 py-3">
        {row.kind === "state" ? (
          <Badge className="rounded-full bg-accent/15 font-semibold text-accent hover:bg-accent/20">
            State
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="rounded-full border-border font-semibold text-muted-foreground"
          >
            Union Territory
          </Badge>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <Switch checked={row.enabled} onCheckedChange={(v) => void onToggle(v)} />
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <span
          className={
            accent
              ? "flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
              : "flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}
