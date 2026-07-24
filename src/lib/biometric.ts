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
    const res = await m.NativeBiometric.isAvailable({ useFallback: true });
    return !!res.isAvailable;
  } catch {
    return false;
  }
}

export async function getBiometricStatus(): Promise<{
  supported: boolean;
  available: boolean;
  enabled: boolean;
  saved: boolean;
  message: string;
}> {
  const m = await mod();
  if (!m) {
    return {
      supported: false,
      available: false,
      enabled: false,
      saved: false,
      message: "Open the installed iOS app to use Face ID.",
    };
  }
  try {
    const [availability, saved] = await Promise.all([
      m.NativeBiometric.isAvailable({ useFallback: true }),
      m.NativeBiometric.isCredentialsSaved({ server: SERVER }).catch(() => ({ isSaved: false })),
    ]);
    const enabled = !!availability.isAvailable && (isBiometricEnabled() || !!saved.isSaved);
    if (enabled && !isBiometricEnabled() && typeof window !== "undefined") {
      window.localStorage.setItem(ENABLED_KEY, "1");
    }
    return {
      supported: true,
      available: !!availability.isAvailable,
      enabled,
      saved: !!saved.isSaved,
      message: availability.isAvailable
        ? saved.isSaved
          ? "Face ID is saved on this device."
          : "Face ID is available but not enabled yet."
        : `Face ID is not available on this device${availability.errorCode ? ` (${availability.errorCode})` : ""}.`,
    };
  } catch (err) {
    return {
      supported: true,
      available: false,
      enabled: false,
      saved: false,
      message: err instanceof Error ? err.message : String(err),
    };
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
    useFallback: true,
    fallbackTitle: "Use Passcode",
  });
  await m.NativeBiometric.setCredentials({
    username: USERNAME,
    password: phone,
    server: SERVER,
    accessControl: m.AccessControl.BIOMETRY_ANY,
    title: "Protect Face ID sign-in",
    negativeButtonText: "Cancel",
  });
  window.localStorage.setItem(ENABLED_KEY, "1");
}

/** Prompt Face ID and return the stored phone, or null if unavailable / cancelled. */
export async function signInWithBiometric(): Promise<string | null> {
  const m = await mod();
  if (!m) return null;
  try {
    const saved = await m.NativeBiometric.isCredentialsSaved({ server: SERVER });
    if (!isBiometricEnabled() && !saved.isSaved) return null;
    let creds: { username: string; password: string };
    try {
      creds = await m.NativeBiometric.getSecureCredentials({
        server: SERVER,
        reason: "Sign in to Radiant Guard",
        title: "Face ID",
        subtitle: "Use Face ID to continue",
        negativeButtonText: "Cancel",
      });
    } catch {
      // Older saved credentials may not have biometric access-control yet.
      // Keep them working, but still require an explicit Face ID / passcode prompt.
      await m.NativeBiometric.verifyIdentity({
        reason: "Sign in to Radiant Guard",
        title: "Face ID",
        subtitle: "Use Face ID to continue",
        useFallback: true,
        fallbackTitle: "Use Passcode",
      });
      creds = await m.NativeBiometric.getCredentials({ server: SERVER });
    }
    if (creds?.password && typeof window !== "undefined") {
      window.localStorage.setItem(ENABLED_KEY, "1");
    }
    return creds?.password ?? null;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
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
