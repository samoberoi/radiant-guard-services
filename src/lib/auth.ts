import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "radiant.auth";
const DEMO_OTP = "111111";

export type AuthUser = { phone: string };

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
    const u = { phone };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    emit();
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    emit();
  }, []);

  return { user, login, logout };
}

// TODO: replace with real OTP provider (Twilio/MSG91/Supabase phone auth)
export function verifyOtp(code: string): boolean {
  return code === DEMO_OTP;
}

export const DEMO_OTP_HINT = DEMO_OTP;
