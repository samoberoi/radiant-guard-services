import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarDays,
  Cake,
  ClipboardCheck,
  Package,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/LiveFeed";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { nextOccurrence, ageFrom, yearsBetween } from "@/lib/people-insights";

export const Route = createFileRoute("/admin/employee-dashboard")({
  component: EmployeeDashboard,
});

type Me = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  mobile: string | null;
  email: string | null;
  role_key: string | null;
  status: string | null;
  unit_id: string | null;
  designation_id: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
};

type Teammate = {
  id: string;
  full_name: string;
  employee_code: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
  designation_id: string | null;
};

type Notif = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function EmployeeDashboard() {
  const { user } = useAuth();
  const phone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";

  const meQ = useQuery({
    queryKey: ["me-emp", phone],
    enabled: !!phone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,mobile,email,role_key,status,unit_id,designation_id,date_of_birth,approved_at,created_at")
        .eq("mobile", phone)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Me) ?? null;
    },
  });
  const me = meQ.data;

  const lookupsQ = useQuery({
    queryKey: ["me-emp-lookups", me?.unit_id, me?.designation_id],
    enabled: !!me,
    queryFn: async () => {
      const [u, d] = await Promise.all([
        me?.unit_id
          ? supabase.from("units").select("id,name,code,branch_id,customer_id,shift_start_time,shift_end_time,site_address").eq("id", me.unit_id).maybeSingle()
          : Promise.resolve({ data: null }),
        me?.designation_id
          ? supabase.from("designations").select("id,name").eq("id", me.designation_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        unit: (u.data as unknown as { id: string; name: string; code: string; branch_id: string | null; customer_id: string | null; shift_start_time: string | null; shift_end_time: string | null; site_address: string | null } | null),
        designation: (d.data as unknown as { id: string; name: string } | null),
      };
    },
  });
  const unit = lookupsQ.data?.unit ?? null;
  const desig = lookupsQ.data?.designation ?? null;

  // Attendance this month
  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }, []);
  const monthEnd = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }, []);
  const attQ = useQuery({
    queryKey: ["me-attendance", me?.id, monthStart],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("code,ot_hours,entry_date")
        .eq("candidate_id", me!.id)
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);
      if (error) throw error;
      return (data as unknown as { code: string; ot_hours: number; entry_date: string }[]) ?? [];
    },
  });
  const attStats = useMemo(() => {
    const rows = attQ.data ?? [];
    let present = 0, absent = 0, leave = 0, ot = 0;
    for (const r of rows) {
      const c = (r.code || "").toUpperCase();
      if (c === "A") absent++;
      else if (c === "L" || c === "LV") leave++;
      else if (c) present++;
      ot += Number(r.ot_hours || 0);
    }
    return { present, absent, leave, ot, total: rows.length };
  }, [attQ.data]);

  // Team in same unit
  const teamQ = useQuery({
    queryKey: ["me-team", me?.unit_id, me?.id],
    enabled: !!me?.unit_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,photo_url,date_of_birth,approved_at,created_at,designation_id")
        .eq("unit_id", me!.unit_id!)
        .in("status", ["active", "approved"])
        .neq("id", me!.id)
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Teammate[]) ?? [];
    },
  });
  const team = teamQ.data ?? [];

  const desigIds = useMemo(() => Array.from(new Set(team.map((t) => t.designation_id).filter(Boolean))) as string[], [team]);
  const desigNameQ = useQuery({
    queryKey: ["me-team-desig", desigIds.join(",")],
    enabled: desigIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("designations").select("id,name").in("id", desigIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const d of (data as unknown as { id: string; name: string }[]) ?? []) m.set(d.id, d.name);
      return m;
    },
  });
  const desigMap = desigNameQ.data ?? new Map<string, string>();

  // Uniform holdings (issued/acknowledged)
  const issQ = useQuery({
    queryKey: ["me-iss-count", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_issuances")
        .select("id,status")
        .eq("destination_id", me!.id)
        .in("destination_type", ["guard", "field_officer"]);
      if (error) throw error;
      const rows = (data as unknown as { id: string; status: string }[]) ?? [];
      return { total: rows.length, pending: rows.filter((r) => r.status === "issued").length };
    },
  });

  // Notifications
  const notifQ = useQuery({
    queryKey: ["me-notifs"],
    queryFn: async () => {
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link,created_at,read_at")
        .eq("user_id", au.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data as unknown as Notif[]) ?? [];
    },
  });
  const notifs = notifQ.data ?? [];

  // Birthdays & anniversaries within team (30 days horizon)
  const HORIZON = 30;
  const birthdays = useMemo(() => {
    const list: Array<{ id: string; name: string; days: number; date: Date; turningAge: number }> = [];
    for (const t of team) {
      if (!t.date_of_birth) continue;
      const { next, days } = nextOccurrence(t.date_of_birth);
      if (days <= HORIZON) list.push({ id: t.id, name: t.full_name, days, date: next, turningAge: yearsBetween(t.date_of_birth, next) });
    }
    return list.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [team]);
  const anniversaries = useMemo(() => {
    const list: Array<{ id: string; name: string; days: number; date: Date; years: number }> = [];
    for (const t of team) {
      const started = t.approved_at || t.created_at;
      if (!started) continue;
      const { next, days } = nextOccurrence(started);
      const years = yearsBetween(started, next);
      if (days <= HORIZON && years >= 1) list.push({ id: t.id, name: t.full_name, days, date: next, years });
    }
    return list.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [team]);

  if (meQ.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading your dashboard…</div>;
  if (!me) return <div className="p-4 text-sm text-muted-foreground">No employee profile found for this phone.</div>;

  const age = me.date_of_birth ? ageFrom(me.date_of_birth) : null;
  const started = me.approved_at || me.created_at;
  const tenureYears = started ? yearsBetween(started, new Date()) : null;

  return (
    <DashboardShell
      right={
        <div className="space-y-4">
          {/* Notifications */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-primary" /> Notifications</div>
              <Link to="/admin/notifications" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            {notifs.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Nothing new.</div>
            ) : (
              <ul className="space-y-2">
                {notifs.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.link ?? "/admin/notifications"}
                      className={`block rounded-xl border p-3 text-sm transition hover:bg-secondary/60 ${n.read_at ? "border-border" : "border-primary/40 bg-primary/5"}`}
                    >
                      <div className="font-medium">{n.title}</div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(n.created_at).toLocaleString("en-IN")}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Birthdays */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Cake className="h-4 w-4 text-rose-600" /> Upcoming birthdays</div>
            {birthdays.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No birthdays in the next 30 days.</div>
            ) : (
              <ul className="space-y-1.5">
                {birthdays.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{b.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{fmtDate(b.date)} · turns {b.turningAge}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Anniversaries */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-amber-600" /> Work anniversaries</div>
            {anniversaries.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No anniversaries in the next 30 days.</div>
            ) : (
              <ul className="space-y-1.5">
                {anniversaries.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{a.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{fmtDate(a.date)} · {a.years} yr</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      }
    >
      <PageHeader
        title={`Welcome back, ${me.full_name.split(" ")[0] || "there"}`}
        description={desig?.name ? `${desig.name}${unit?.name ? ` · ${unit.name}` : ""}` : "Your workspace"}
        crumbs={[{ label: "My Dashboard" }]}
      />

      {/* Profile card */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-lg font-semibold">
            {me.photo_url ? <img src={me.photo_url} alt="" className="h-full w-full object-cover" /> : (me.full_name?.[0] ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="text-lg font-semibold">{me.full_name}</div>
              {me.employee_code && <div className="font-mono text-xs text-muted-foreground">{me.employee_code}</div>}
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{me.status}</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
              <div><span className="font-medium text-foreground">Phone:</span> {me.mobile ?? "—"}</div>
              <div><span className="font-medium text-foreground">Email:</span> {me.email || "—"}</div>
              <div><span className="font-medium text-foreground">Designation:</span> {desig?.name ?? "—"}</div>
              <div><span className="font-medium text-foreground">Unit:</span> {unit?.name ?? "—"}</div>
              {age !== null && <div><span className="font-medium text-foreground">Age:</span> {age}</div>}
              {tenureYears !== null && <div><span className="font-medium text-foreground">Tenure:</span> {tenureYears} yr</div>}
            </div>
          </div>
          <Link to="/admin/profile" className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
            <UserRound className="mr-1 inline h-3.5 w-3.5" /> View profile
          </Link>
        </div>
      </section>

      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ClipboardCheck} label="Present days" value={attStats.present} accent="emerald" sub={`${new Date().toLocaleString("en-IN",{month:"long"})}`} />
        <StatTile icon={ClipboardCheck} label="Absent" value={attStats.absent} accent="rose" />
        <StatTile icon={ClipboardCheck} label="Leaves" value={attStats.leave} accent="amber" />
        <StatTile icon={Package} label="Uniform items" value={issQ.data?.total ?? 0} accent="sky" sub={issQ.data?.pending ? `${issQ.data.pending} pending OTP` : undefined} />
      </section>

      {/* Duty & unit */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Your duty</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Shift start</dt>
            <dd className="font-medium">{unit?.shift_start_time || "—"}</dd>
            <dt className="text-muted-foreground">Shift end</dt>
            <dd className="font-medium">{unit?.shift_end_time || "—"}</dd>
            <dt className="text-muted-foreground">OT this month</dt>
            <dd className="font-medium">{attStats.ot} hrs</dd>
            <dt className="text-muted-foreground">Site</dt>
            <dd className="font-medium">{unit?.site_address || unit?.name || "—"}</dd>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" /> Unit</div>
          <div className="text-lg font-semibold">{unit?.name ?? "Not assigned"}</div>
          {unit?.code && <div className="font-mono text-xs text-muted-foreground">{unit.code}</div>}
          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-lg bg-secondary/60 px-3 py-2 text-center">
              <div className="text-lg font-semibold">{team.length + 1}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Team size</div>
            </div>
            <Link to="/admin/my-inventory" className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm font-medium hover:bg-secondary">
              My Uniform →
            </Link>
          </div>
        </div>
      </section>

      {/* Team roster */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Your team at this unit</div>
          <div className="text-xs text-muted-foreground">{team.length} colleague{team.length === 1 ? "" : "s"}</div>
        </div>
        {team.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No teammates yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {team.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">
                  {t.photo_url ? <img src={t.photo_url} alt="" className="h-full w-full object-cover" /> : (t.full_name?.[0] ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.full_name}</div>
                  <div className="text-xs text-muted-foreground">{t.designation_id ? desigMap.get(t.designation_id) ?? "" : ""}</div>
                </div>
                {t.employee_code && <div className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.employee_code}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  accent: "emerald" | "rose" | "amber" | "sky";
}) {
  const chip = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  }[accent];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${chip}`}><Icon className="h-4 w-4" /></div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
