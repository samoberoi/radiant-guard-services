import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  CalendarRange,
  ChevronDown,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/system-logs")({
  component: SystemLogsPage,
});

type LogRow = {
  id: string;
  created_at: string;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  user_phone: string;
  user_id: string | null;
  user_role: string;
  ip_address: string;
  user_agent: string;
  status: string;
  error_message: string;
  details: Record<string, unknown>;
};

type RangePreset = "today" | "yesterday" | "this_month" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function resolveRange(preset: RangePreset, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === "this_month") return { from: startOfMonth(now), to: endOfDay(now) };
  // custom
  const f = from ? new Date(from + "T00:00:00") : startOfDay(now);
  const t = to ? new Date(to + "T23:59:59.999") : endOfDay(now);
  return { from: f, to: t };
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  update: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  delete: "bg-red-500/15 text-red-700 dark:text-red-300",
  enable: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  disable: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  login: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  logout: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

function SystemLogsPage() {
  const [preset, setPreset] = useState<RangePreset>("today");
  const [from, setFrom] = useState<string>(fmtIso(new Date()));
  const [to, setTo] = useState<string>(fmtIso(new Date()));
  const [user, setUser] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<LogRow | null>(null);

  const range = useMemo(() => resolveRange(preset, from, to), [preset, from, to]);

  const { data: logs = [], refetch, isFetching } = useQuery({
    queryKey: [
      "system_logs",
      range.from.toISOString(),
      range.to.toISOString(),
      user,
      moduleFilter,
      actionFilter,
      statusFilter,
    ],
    queryFn: async (): Promise<LogRow[]> => {
      let q = supabase
        .from("system_logs" as never)
        .select("*")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (user.trim()) q = q.ilike("user_phone", `%${user.trim()}%`);
      if (moduleFilter !== "all") q = q.eq("module", moduleFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
  });

  const modules = useMemo(
    () => Array.from(new Set(logs.map((l) => l.module))).sort(),
    [logs],
  );
  const actions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t) return logs;
    return logs.filter(
      (l) =>
        l.module.toLowerCase().includes(t) ||
        l.action.toLowerCase().includes(t) ||
        l.entity_label.toLowerCase().includes(t) ||
        l.entity_type.toLowerCase().includes(t) ||
        l.user_phone.toLowerCase().includes(t) ||
        l.ip_address.toLowerCase().includes(t) ||
        l.error_message.toLowerCase().includes(t),
    );
  }, [logs, text]);

  return (
    <div>
      <PageHeader
        title="System Logs"
        description="Audit trail of every action across the platform — auth, edits, toggles, deletes."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "System Logs" },
        ]}
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Label className="mb-1.5 block text-xs">Date range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="h-10">
              <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div className="lg:col-span-2">
              <Label className="mb-1.5 block text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
            </div>
            <div className="lg:col-span-2">
              <Label className="mb-1.5 block text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
            </div>
          </>
        )}
        <div className={preset === "custom" ? "lg:col-span-2" : "lg:col-span-3"}>
          <Label className="mb-1.5 block text-xs">User (phone)</Label>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="e.g. 9876543210"
            className="h-10"
          />
        </div>
        <div className={preset === "custom" ? "lg:col-span-3" : "lg:col-span-3"}>
          <Label className="mb-1.5 block text-xs">Module</Label>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="lg:col-span-3">
          <Label className="mb-1.5 block text-xs">Action</Label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="lg:col-span-3">
          <Label className="mb-1.5 block text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="lg:col-span-9">
          <Label className="mb-1.5 block text-xs">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search module, action, entity, user, IP, error…"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <div className="flex items-end lg:col-span-3">
          <Button
            variant="outline"
            className="h-10 w-full"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer hover:bg-secondary/30"
                  onClick={() => setSelected(l)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-foreground/80">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{l.module}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[l.action] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground/90">
                    {l.entity_label || l.entity_type || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{l.user_phone || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">{l.ip_address || "—"}</td>
                  <td className="px-4 py-3">
                    {l.status === "failure" ? (
                      <Badge variant="destructive" className="gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        failure
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Activity className="h-3 w-3" />
                        success
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No log entries for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log entry</DialogTitle>
            <DialogDescription>
              {selected && new Date(selected.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="grid gap-3 text-sm">
              <Field label="Module" value={selected.module} />
              <Field label="Action" value={selected.action} />
              <Field
                label="Entity"
                value={`${selected.entity_type}${selected.entity_label ? ` · ${selected.entity_label}` : ""}${selected.entity_id ? ` (#${selected.entity_id})` : ""}`}
              />
              <Field label="User" value={`${selected.user_phone || "—"} (${selected.user_role || "—"})`} />
              <Field label="IP address" value={selected.ip_address || "—"} />
              <Field label="User agent" value={selected.user_agent || "—"} />
              <Field label="Status" value={selected.status} />
              {selected.error_message && (
                <Field label="Error" value={selected.error_message} />
              )}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Details
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-secondary/50 p-3 text-xs text-foreground/90">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="col-span-2 break-all text-foreground/90">{value}</div>
    </div>
  );
}

export default SystemLogsPage;
