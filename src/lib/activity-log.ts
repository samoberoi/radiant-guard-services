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
  /** override actor (e.g. login flow) */
  userPhone?: string;
  userRole?: string;
  /** override IP if already known (avoids extra fetch) */
  ip?: string;
};

export async function logActivity(p: LogParams): Promise<void> {
  try {
    const u = readUser();
    const phone = p.userPhone ?? u.phone;
    const role = p.userRole ?? u.role;
    const ip = p.ip ?? cachedIp ?? "";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const { data: auth } = await supabase.auth.getUser();
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
      details: p.details ?? {},
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
