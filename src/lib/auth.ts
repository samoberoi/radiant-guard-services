import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "radiant.auth";

/**
 * ⚠️ PRE-LAUNCH TESTING ONLY ⚠️
 * The OTP below is a hardcoded development bypass used while the SMS gateway
 * integration is pending. Before launch, this MUST be replaced with a real
 * OTP provider (Twilio / MSG91 / Supabase phone auth) and the value should
 * come exclusively from server-side configuration / environment variables.
 *
 * The default OTP and super-admin phone can be overridden via Vite env vars:
 *   VITE_DEMO_OTP            (default: "111111")
 *   VITE_SUPER_ADMIN_PHONE   (default: "8373914073")
 */
const DEMO_OTP =
  (import.meta.env.VITE_DEMO_OTP as string | undefined) ?? "111111";

export const SUPER_ADMIN_PHONE =
  (import.meta.env.VITE_SUPER_ADMIN_PHONE as string | undefined) ??
  "8373914073";

export type AuthUser = { phone: string; role: "super_admin" | "user" };

function read(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(read());
    const sync = () => setUser(read());
    listeners.add(sync);
    window.addEventListener("storage", sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback((phone: string) => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    const role: AuthUser["role"] =
      digits === SUPER_ADMIN_PHONE ? "super_admin" : "user";
    const u: AuthUser = { phone, role };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    emit();
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    emit();
  }, []);

  return { user, login, logout };
}

// TODO: replace with real OTP provider (Twilio / MSG91 / Supabase phone auth).
// Hardcoded OTP is ONLY for pre-launch testing.
export function verifyOtp(code: string): boolean {
  return code === DEMO_OTP;
}

export const DEMO_OTP_HINT = DEMO_OTP;
