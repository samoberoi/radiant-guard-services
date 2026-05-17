import { supabase } from "@/integrations/supabase/client";
import type { PermissionAction } from "@/lib/rbac-modules";

export type RoleRow = {
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  sort_order: number;
};

export type PermissionRow = {
  id?: string;
  role_key: string;
  module_key: string;
  sub_module_key: string; // '' for module-level
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type PermKey = `${string}::${string}`; // `${module_key}::${sub_module_key}`

export function permKey(moduleKey: string, subModuleKey = ""): PermKey {
  return `${moduleKey}::${subModuleKey}` as PermKey;
}

export const EMPTY_PERM = { can_view: false, can_edit: false, can_delete: false };

export async function fetchRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("key,name,description,is_system,sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as RoleRow[];
}

export async function fetchRolePermissions(roleKey: string): Promise<PermissionRow[]> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("id,role_key,module_key,sub_module_key,can_view,can_edit,can_delete")
    .eq("role_key", roleKey);
  if (error) throw error;
  return (data ?? []) as PermissionRow[];
}

export async function saveRolePermissions(
  roleKey: string,
  rows: PermissionRow[],
): Promise<void> {
  // Replace all rows for the role in one shot — simplest & matches editor UX.
  const del = await supabase.from("role_permissions").delete().eq("role_key", roleKey);
  if (del.error) throw del.error;
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    role_key: roleKey,
    module_key: r.module_key,
    sub_module_key: r.sub_module_key ?? "",
    can_view: r.can_view,
    can_edit: r.can_edit,
    can_delete: r.can_delete,
  }));
  const ins = await supabase.from("role_permissions").insert(payload);
  if (ins.error) throw ins.error;
}

// Enforce action implications: edit ⇒ view, delete ⇒ edit+view.
export function normalizePerm(p: { can_view: boolean; can_edit: boolean; can_delete: boolean }) {
  const can_delete = p.can_delete;
  const can_edit = p.can_edit || can_delete;
  const can_view = p.can_view || can_edit;
  return { can_view, can_edit, can_delete };
}

export function hasFromMap(
  map: Map<PermKey, { can_view: boolean; can_edit: boolean; can_delete: boolean }>,
  moduleKey: string,
  subModuleKey: string,
  action: PermissionAction,
): boolean {
  const row = map.get(permKey(moduleKey, subModuleKey));
  if (!row) return false;
  if (action === "view") return row.can_view;
  if (action === "edit") return row.can_edit;
  return row.can_delete;
}
