/**
 * Face ID / Touch ID helper (iOS-first, Android compatible).
 *
 * Uses @capgo/capacitor-native-biometric to store the last-signed-in phone
 * behind the device biometric prompt. On subsequent launches the user can
 * tap "Sign in with Face ID" and skip the OTP step entirely.
 *
 * All calls are guarded so the web build is unaffected.
 */
import { isNativePlatform } from "./native";

const SERVER = "app.lovable.radiantguard";
const USERNAME = "primary-phone";
const ENABLED_KEY = "radiant.biometric.enabled";

type Native = typeof import("@capgo/capacitor-native-biometric");

async function mod(): Promise<Native | null> {
  if (!isNativePlatform()) return null;
  try {
    return await import("@capgo/capacitor-native-biometric");
  } catch {
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const m = await mod();
  if (!m) return false;
  try {
    const res = await m.NativeBiometric.isAvailable();
    return !!res.isAvailable;
  } catch {
    return false;
  }
}

export function isBiometricEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "1";
}

/** Prompt Face ID, then save the phone in the iOS Keychain / Android Keystore. */
export async function enableBiometric(phone: string): Promise<void> {
  const m = await mod();
  if (!m) throw new Error("Biometric authentication is only available on device.");
  await m.NativeBiometric.verifyIdentity({
    reason: "Enable Face ID for quick sign-in",
    title: "Enable Face ID",
    subtitle: "Confirm it's you to save this device.",
  });
  await m.NativeBiometric.setCredentials({
    username: USERNAME,
    password: phone,
    server: SERVER,
  });
  window.localStorage.setItem(ENABLED_KEY, "1");
}

/** Prompt Face ID and return the stored phone, or null if unavailable / cancelled. */
export async function signInWithBiometric(): Promise<string | null> {
  const m = await mod();
  if (!m || !isBiometricEnabled()) return null;
  try {
    await m.NativeBiometric.verifyIdentity({
      reason: "Sign in to Radiant Guard",
      title: "Face ID",
      subtitle: "Use Face ID to continue",
    });
    const creds = await m.NativeBiometric.getCredentials({ server: SERVER });
    return creds?.password ?? null;
  } catch {
    return null;
  }
}

export async function disableBiometric(): Promise<void> {
  const m = await mod();
  if (m) {
    try {
      await m.NativeBiometric.deleteCredentials({ server: SERVER });
    } catch {
      /* noop */
    }
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(ENABLED_KEY);
}
