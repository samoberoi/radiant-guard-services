import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "radiant.auth";

let cachedIp: string | null = null;
let ipFetchPromise: Promise<string> | null = null;

export async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  if (ipFetchPromise) return ipFetchPromise;
  ipFetchPromise = fetch("https://api.ipify.org?format=json")
    .then((r) => r.json())
    .then((j: { ip?: string }) => {
      cachedIp = j.ip ?? "";
      return cachedIp;
    })
    .catch(() => "");
  return ipFetchPromise;
}

function readUser(): { phone: string; role: string } {
  if (typeof window === "undefined") return { phone: "", role: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { phone: "", role: "" };
    const u = JSON.parse(raw) as { phone?: string; role?: string };
    return { phone: u.phone ?? "", role: u.role ?? "" };
  } catch {
    return { phone: "", role: "" };
  }
}

export type LogParams = {
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  status?: "success" | "failure";
  errorMessage?: string;
  details?: Record<string, unknown>;
  /** Snapshot before mutation — used to compute a field-level diff into details.changes */
  before?: Record<string, unknown> | null;
  /** Snapshot after mutation — used to compute a field-level diff into details.changes */
  after?: Record<string, unknown> | null;
  /** override actor (e.g. login flow) */
  userPhone?: string;
  userRole?: string;
  /** override IP if already known (avoids extra fetch) */
  ip?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/** Compute a shallow diff of changed top-level fields between two objects. */
export function diffObjects(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (stableStringify(a[k]) !== stableStringify(b[k])) {
      out[k] = { from: a[k] ?? null, to: b[k] ?? null };
    }
  }
  return out;
}

export async function logActivity(p: LogParams): Promise<void> {
  try {
    const u = readUser();
    const phone = p.userPhone ?? u.phone;
    const role = p.userRole ?? u.role;
    const ip = p.ip ?? cachedIp ?? "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const { data: auth } = await supabase.auth.getUser();
    const details: Record<string, unknown> = { ...(p.details ?? {}) };
    if (p.before !== undefined || p.after !== undefined) {
      const changes = diffObjects(p.before ?? null, p.after ?? null);
      if (Object.keys(changes).length > 0) details.changes = changes;
      if (p.before !== undefined && details.before === undefined) details.before = p.before;
      if (p.after !== undefined && details.after === undefined) details.after = p.after;
    }
    await supabase.from("system_logs" as never).insert({
      module: p.module,
      action: p.action,
      entity_type: p.entityType ?? "",
      entity_id: p.entityId ?? "",
      entity_label: p.entityLabel ?? "",
      user_phone: phone,
      user_id: auth?.user?.id ?? null,
      user_role: role,
      ip_address: ip,
      user_agent: ua,
      status: p.status ?? "success",
      error_message: p.errorMessage ?? "",
      details,
    } as never);
    // Kick off IP resolution for next call if missing
    if (!cachedIp) void getClientIp();
  } catch (e) {
    // Logging must never break flows
    // eslint-disable-next-line no-console
    console.warn("logActivity failed", e);
  }
}

/** Convenience wrapper around an async mutation that auto-logs success/failure. */
export async function withLog<T>(
  params: Omit<LogParams, "status" | "errorMessage">,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    void logActivity({ ...params, status: "success" });
    return result;
  } catch (e) {
    void logActivity({
      ...params,
      status: "failure",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
