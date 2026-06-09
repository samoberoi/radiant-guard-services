import { supabase } from "@/integrations/supabase/client";

export type Notification = {
  id: string;
  userId: string;
  actorId: string | null;
  type: string;
  title: string;
  message: string;
  link: string;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
};

function rowToNotification(r: Record<string, unknown>): Notification {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    actorId: r.actor_id ? String(r.actor_id) : null,
    type: String(r.type ?? "generic"),
    title: String(r.title ?? ""),
    message: String(r.message ?? ""),
    link: String(r.link ?? ""),
    entityType: String(r.entity_type ?? ""),
    entityId: String(r.entity_id ?? ""),
    readAt: r.read_at ? String(r.read_at) : null,
    createdAt: String(r.created_at),
  };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listMyNotifications(): Promise<Notification[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("notifications" as never)
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data as unknown) as Record<string, unknown>[]).map(rowToNotification);
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const actor = await currentUserId();
  const { error } = await supabase.from("notifications" as never).insert({
    user_id: input.userId,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  } as never);
  if (error) throw error;
}

export async function getAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_admin_user_ids" as never);
  if (error) {
    console.error("getAdminUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

export async function notifyAdmins(input: {
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const ids = await getAdminUserIds();
  if (ids.length === 0) return;
  await Promise.all(
    ids.map((uid) =>
      createNotification({ userId: uid, ...input }).catch((e) =>
        console.error("notifyAdmins insert failed", e),
      ),
    ),
  );
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("notifications" as never)
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead() {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("notifications" as never)
    .update({ read_at: new Date().toISOString() } as never)
    .eq("user_id", uid)
    .is("read_at", null);
  if (error) throw error;
}

/**
 * Returns auth user IDs of every active user whose role has the
 * `can_approve` flag set for the given module. Used to fan out
 * approval-pending notifications without hardcoding role names.
 */
export async function getApproverUserIds(moduleKey: string): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "get_user_ids_with_approve" as never,
    { _module: moduleKey } as never,
  );
  if (error) {
    console.error("getApproverUserIds error", error);
    return [];
  }
  return ((data as unknown) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/**
 * Convenience: send the same notification to every approver of a module.
 * Self-notifications are skipped.
 */
export async function notifyApprovers(input: {
  moduleKey: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}) {
  const [actor, ids] = await Promise.all([
    currentUserId(),
    getApproverUserIds(input.moduleKey),
  ]);
  const recipients = ids.filter((id) => id !== actor);
  if (recipients.length === 0) return 0;
  const rows = recipients.map((uid) => ({
    user_id: uid,
    actor_id: actor,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? "",
    entity_type: input.entityType ?? "",
    entity_id: input.entityId ?? "",
  }));
  const { error } = await supabase.from("notifications" as never).insert(rows as never);
  if (error) {
    console.error("notifyApprovers insert error", error);
    return 0;
  }
  return recipients.length;
}
