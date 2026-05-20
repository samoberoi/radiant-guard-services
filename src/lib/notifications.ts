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
