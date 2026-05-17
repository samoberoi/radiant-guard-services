import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import {
  PERMISSION_ACTIONS,
  RBAC_MODULES,
  type ModuleDef,
  type PermissionAction,
} from "@/lib/rbac-modules";
import {
  EMPTY_PERM,
  fetchRolePermissions,
  fetchRoles,
  normalizePerm,
  permKey,
  saveRolePermissions,
  type PermKey,
  type PermissionRow,
  type RoleRow,
} from "@/lib/rbac";

export const Route = createFileRoute("/admin/rbac")({
  component: RBACPage,
});

type PermState = { can_view: boolean; can_edit: boolean; can_delete: boolean };
type PermMap = Map<PermKey, PermState>;

const ACTION_META: Record<
  PermissionAction,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  view: { label: "View", icon: Eye, tint: "text-sky-500" },
  edit: { label: "Edit", icon: Pencil, tint: "text-amber-500" },
  delete: { label: "Delete", icon: Trash2, tint: "text-rose-500" },
};

function buildMap(rows: PermissionRow[]): PermMap {
  const m: PermMap = new Map();
  for (const r of rows) {
    m.set(permKey(r.module_key, r.sub_module_key ?? ""), {
      can_view: r.can_view,
      can_edit: r.can_edit,
      can_delete: r.can_delete,
    });
  }
  return m;
}

function mapToRows(map: PermMap): PermissionRow[] {
  const out: PermissionRow[] = [];
  map.forEach((perm, key) => {
    const [module_key, sub_module_key] = key.split("::");
    if (!perm.can_view && !perm.can_edit && !perm.can_delete) return;
    out.push({
      role_key: "",
      module_key,
      sub_module_key,
      ...perm,
    });
  });
  return out;
}

function getCell(map: PermMap, moduleKey: string, sub: string): PermState {
  return map.get(permKey(moduleKey, sub)) ?? { ...EMPTY_PERM };
}

function setCell(map: PermMap, moduleKey: string, sub: string, perm: PermState): PermMap {
  const next = new Map(map);
  next.set(permKey(moduleKey, sub), normalizePerm(perm));
  return next;
}

/** Tri-state for a parent column based on sub-modules. */
type Tri = "none" | "some" | "all";
function aggregate(
  map: PermMap,
  mod: ModuleDef,
  action: PermissionAction,
): Tri {
  if (mod.subModules.length === 0) {
    const v = getCell(map, mod.key, "");
    const has =
      action === "view" ? v.can_view : action === "edit" ? v.can_edit : v.can_delete;
    return has ? "all" : "none";
  }
  let on = 0;
  for (const s of mod.subModules) {
    const v = getCell(map, mod.key, s.key);
    const has =
      action === "view" ? v.can_view : action === "edit" ? v.can_edit : v.can_delete;
    if (has) on++;
  }
  if (on === 0) return "none";
  if (on === mod.subModules.length) return "all";
  return "some";
}

function setParent(
  map: PermMap,
  mod: ModuleDef,
  action: PermissionAction,
  on: boolean,
): PermMap {
  let next = map;
  if (mod.subModules.length === 0) {
    const cur = getCell(next, mod.key, "");
    next = setCell(next, mod.key, "", { ...cur, [`can_${action}`]: on });
    return next;
  }
  for (const s of mod.subModules) {
    const cur = getCell(next, mod.key, s.key);
    next = setCell(next, mod.key, s.key, { ...cur, [`can_${action}`]: on });
  }
  // Also stamp parent row for aggregate quick-checks
  const curP = getCell(next, mod.key, "");
  next = setCell(next, mod.key, "", { ...curP, [`can_${action}`]: on });
  return next;
}

function grantAll(map: PermMap, mod: ModuleDef): PermMap {
  let next = map;
  const full = { can_view: true, can_edit: true, can_delete: true };
  if (mod.subModules.length === 0) {
    next = setCell(next, mod.key, "", full);
    return next;
  }
  for (const s of mod.subModules) {
    next = setCell(next, mod.key, s.key, full);
  }
  next = setCell(next, mod.key, "", full);
  return next;
}

function clearAll(map: PermMap, mod: ModuleDef): PermMap {
  let next = map;
  const none = { ...EMPTY_PERM };
  if (mod.subModules.length === 0) {
    next = setCell(next, mod.key, "", none);
    return next;
  }
  for (const s of mod.subModules) {
    next = setCell(next, mod.key, s.key, none);
  }
  next = setCell(next, mod.key, "", none);
  return next;
}

function mapsEqual(a: PermMap, b: PermMap): boolean {
  if (a.size !== b.size) {
    // size mismatch only matters if either side has any "true" not present in the other
  }
  const allKeys = new Set<PermKey>([...a.keys(), ...b.keys()]);
  for (const k of allKeys) {
    const x = a.get(k) ?? EMPTY_PERM;
    const y = b.get(k) ?? EMPTY_PERM;
    if (x.can_view !== y.can_view || x.can_edit !== y.can_edit || x.can_delete !== y.can_delete) {
      return false;
    }
  }
  return true;
}

function RBACPage() {
  const queryClient = useQueryClient();
  const [activeRole, setActiveRole] = useState<string>("guard");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    RBAC_MODULES.reduce((acc, m) => ({ ...acc, [m.key]: m.subModules.length > 0 }), {}),
  );
  const [draft, setDraft] = useState<PermMap>(new Map());

  const rolesQuery = useQuery({ queryKey: ["rbac", "roles"], queryFn: fetchRoles });
  const permsQuery = useQuery({
    queryKey: ["rbac", "perms", activeRole],
    queryFn: () => fetchRolePermissions(activeRole),
    enabled: !!activeRole,
  });

  const serverMap = useMemo(
    () => buildMap(permsQuery.data ?? []),
    [permsQuery.data],
  );

  useEffect(() => {
    setDraft(serverMap);
  }, [serverMap]);

  const isSuper = activeRole === "super_admin";
  const dirty = !isSuper && !mapsEqual(draft, serverMap);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await saveRolePermissions(activeRole, mapToRows(draft));
    },
    onSuccess: async () => {
      const role = rolesQuery.data?.find((r) => r.key === activeRole);
      void logActivity({
        module: "Role-Based Access Control",
        action: "update",
        entityType: "role",
        entityId: activeRole,
        entityLabel: role?.name ?? activeRole,
      });
      toast.success("Permissions saved", { description: role?.name ?? activeRole });
      await queryClient.invalidateQueries({ queryKey: ["rbac", "perms", activeRole] });
    },
    onError: (e) => {
      toast.error("Failed to save permissions", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const roles: RoleRow[] = rolesQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Role-Based Access Control"
        description="Pick a role and grant View, Edit, or Delete on every module and sub-module."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "Role-Based Access Control" },
        ]}
      />

      {/* Role chip selector */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {roles.map((r) => {
          const active = r.key === activeRole;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setActiveRole(r.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                active
                  ? "border-accent bg-accent/15 text-accent shadow-sm"
                  : "border-border bg-card text-foreground/75 hover:border-accent/40 hover:text-foreground",
              )}
            >
              {r.is_system && <ShieldCheck className="h-3.5 w-3.5" />}
              {r.name}
            </button>
          );
        })}
      </div>

      {/* Active role banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isSuper ? "bg-accent/20 text-accent" : "bg-secondary text-foreground",
            )}
          >
            {isSuper ? <Lock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-display text-base font-bold tracking-tight">
              {roles.find((r) => r.key === activeRole)?.name ?? activeRole}
            </div>
            <p className="text-xs text-muted-foreground">
              {isSuper
                ? "Super Admin always has full access. This role is locked."
                : roles.find((r) => r.key === activeRole)?.description || "Configure permissions below."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isSuper && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft(() => {
                    let next: PermMap = new Map();
                    for (const m of RBAC_MODULES) next = grantAll(next, m);
                    return next;
                  })
                }
                className="h-9"
                title="Grant View, Edit and Delete on every module and sub-module"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Grant full access
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft(new Map())}
                className="h-9"
                title="Remove every permission for this role"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Revoke all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft(serverMap)}
                disabled={!dirty || saveMutation.isPending}
                className="h-9"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending || isSuper}
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* Header row */}
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,96px)] items-center gap-2 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <div>Module</div>
          {PERMISSION_ACTIONS.map((a) => {
            const Icon = ACTION_META[a].icon;
            return (
              <div key={a} className="flex items-center justify-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5", ACTION_META[a].tint)} />
                {ACTION_META[a].label}
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-border">
          {RBAC_MODULES.map((mod) => {
            const open = expanded[mod.key];
            const ParentIcon = mod.icon;
            const hasChildren = mod.subModules.length > 0;

            return (
              <div key={mod.key}>
                {/* Parent row */}
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,96px)] items-center gap-2 px-4 py-3 hover:bg-secondary/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [mod.key]: !open }))}
                        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={open ? "Collapse" : "Expand"}
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-6" />
                    )}
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <ParentIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{mod.label}</div>
                      {hasChildren && (
                        <div className="text-[11px] text-muted-foreground">
                          {mod.subModules.length} sub-modules
                        </div>
                      )}
                    </div>
                  </div>

                  {PERMISSION_ACTIONS.map((a) => {
                    const agg = aggregate(draft, mod, a);
                    return (
                      <div key={a} className="flex justify-center">
                        <TriBox
                          state={agg}
                          disabled={isSuper}
                          onClick={() =>
                            setDraft((m) => setParent(m, mod, a, agg !== "all"))
                          }
                        />
                      </div>
                    );
                  })}

                </div>

                {/* Sub-module rows */}
                {hasChildren && open && (
                  <div className="bg-secondary/15">
                    {mod.subModules.map((sub) => {
                      const cell = getCell(draft, mod.key, sub.key);
                      const SubIcon = sub.icon;
                      return (
                        <div
                          key={sub.key}
                          className="grid grid-cols-[minmax(0,1fr)_repeat(3,96px)] items-center gap-2 px-4 py-2 pl-14 hover:bg-secondary/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground">
                              <SubIcon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate text-sm text-foreground/85">
                              {sub.label}
                            </span>
                          </div>
                          {PERMISSION_ACTIONS.map((a) => {
                            const on =
                              a === "view"
                                ? cell.can_view
                                : a === "edit"
                                  ? cell.can_edit
                                  : cell.can_delete;
                            return (
                              <div key={a} className="flex justify-center">
                                <CheckBox
                                  on={on}
                                  disabled={isSuper}
                                  action={a}
                                  onClick={() =>
                                    setDraft((m) =>
                                      setCell(m, mod.key, sub.key, {
                                        ...cell,
                                        [`can_${a}`]: !on,
                                      }),
                                    )
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="font-semibold">Note:</span> Edit implies View. Delete implies Edit and
        View. These are enforced automatically.
      </p>
    </div>
  );
}

function CheckBox({
  on,
  disabled,
  action,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  action: PermissionAction;
  onClick: () => void;
}) {
  const Icon = ACTION_META[action].icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
        on
          ? "border-accent bg-accent text-accent-foreground shadow"
          : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
      aria-pressed={on}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function TriBox({
  state,
  disabled,
  onClick,
}: {
  state: Tri;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
        state === "all" && "border-accent bg-accent text-accent-foreground shadow",
        state === "some" && "border-accent/60 bg-accent/20 text-accent",
        state === "none" &&
          "border-border bg-background text-muted-foreground hover:border-accent/50",
        disabled && "cursor-not-allowed opacity-50",
      )}
      aria-label={`Toggle ${state}`}
    >
      {state === "all" && <span className="text-sm">✓</span>}
      {state === "some" && <span className="h-0.5 w-3 rounded bg-accent" />}
      {state === "none" && <span className="h-2 w-2 rounded-full border border-current" />}
    </button>
  );
}
