/** Native Face ID / Touch ID helper with the proven Radiant Swift plugin first. */
import { registerPlugin } from "@capacitor/core";
import { getNativeRuntimeSnapshot, isNativePlatform, logNativeEvent } from "./native";

const SERVER = "app.lovable.radiantguard";
const USERNAME = "primary-phone";
const ENABLED_KEY = "radiant.biometric.enabled";

type Native = typeof import("@capgo/capacitor-native-biometric");
type RadiantBiometricCheck = {
  available: boolean;
  biometryAvailable?: boolean;
  deviceSecure: boolean;
  biometryType: string;
  label: string;
  code: string;
  reason: string;
};
type RadiantBiometricsPlugin = {
  check(): Promise<RadiantBiometricCheck>;
  authenticate(options: { reason: string }): Promise<{ success: boolean }>;
};
type RadiantNativeAuthStorePlugin = {
  getPhone(): Promise<{ hasPhone?: boolean; phone?: string }>;
  setPhone(options: { phone: string }): Promise<{ saved: boolean }>;
  clearPhone(): Promise<{ cleared: boolean }>;
};

const RadiantBiometrics = registerPlugin<RadiantBiometricsPlugin>("RadiantBiometrics");
const RadiantNativeAuthStore = registerPlugin<RadiantNativeAuthStorePlugin>("RadiantNativeAuthStore");

function isPluginMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not implemented|unimplemented|plugin/i.test(message);
}

async function mod(): Promise<Native | null> {
  if (!isNativePlatform()) {
    logNativeEvent("biometric", "plugin skipped: not native", getNativeRuntimeSnapshot());
    return null;
  }
  try {
    return await import("@capgo/capacitor-native-biometric");
  } catch (err) {
    logNativeEvent("biometric", "plugin import failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function checkRadiantBiometrics(): Promise<RadiantBiometricCheck | null> {
  if (!isNativePlatform()) return null;
  try {
    const info = await RadiantBiometrics.check();
    logNativeEvent("biometric", "RadiantBiometrics status checked", info);
    return info;
  } catch (err) {
    logNativeEvent("biometric", "RadiantBiometrics status failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function authenticateRadiantBiometrics(reason: string): Promise<boolean | null> {
  if (!isNativePlatform()) return null;
  try {
    const result = await RadiantBiometrics.authenticate({ reason });
    logNativeEvent("biometric", "RadiantBiometrics authentication result", result);
    return result.success !== false;
  } catch (err) {
    logNativeEvent("biometric", "RadiantBiometrics authentication failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (isPluginMissing(err)) return null;
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function getStoredRadiantPhone(): Promise<string | null> {
  if (!isNativePlatform()) return null;
  try {
    const result = await RadiantNativeAuthStore.getPhone();
    logNativeEvent("biometric", "native stored phone checked", { hasPhone: !!result.phone });
    return result.phone || null;
  } catch (err) {
    logNativeEvent("biometric", "native stored phone check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const radiant = await checkRadiantBiometrics();
  if (radiant) return !!radiant.available;

  const m = await mod();
  if (!m) return false;
  try {
    const res = await m.NativeBiometric.isAvailable({ useFallback: true });
    logNativeEvent("biometric", "availability checked", res);
    return !!res.isAvailable;
  } catch (err) {
    logNativeEvent("biometric", "availability check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
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
  const radiant = await checkRadiantBiometrics();
  if (radiant) {
    const savedPhone = await getStoredRadiantPhone();
    const enabled = !!radiant.available && (isBiometricEnabled() || !!savedPhone);
    if (enabled && !isBiometricEnabled() && typeof window !== "undefined") {
      window.localStorage.setItem(ENABLED_KEY, "1");
    }
    return {
      supported: true,
      available: !!radiant.available,
      enabled,
      saved: !!savedPhone,
      message: radiant.available
        ? savedPhone
          ? `${radiant.label || "Face ID"} is saved on this device.`
          : `${radiant.label || "Face ID"} is available but not enabled yet.`
        : radiant.reason || "Face ID is not available on this device.",
    };
  }

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
    logNativeEvent("biometric", "status checked", { availability, saved });
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
    logNativeEvent("biometric", "status check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
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
  const radiant = await checkRadiantBiometrics();
  if (radiant?.available) {
    logNativeEvent("biometric", "native enable started");
    const ok = await authenticateRadiantBiometrics("Enable Face ID for Radiant Guard");
    if (ok) {
      const saved = await RadiantNativeAuthStore.setPhone({ phone });
      logNativeEvent("biometric", "native phone saved", saved);
      if (!saved.saved) throw new Error("Face ID could not save this device.");
      window.localStorage.setItem(ENABLED_KEY, "1");
      return;
    }
  }

  const m = await mod();
  if (!m) throw new Error("Biometric authentication is only available on device.");
  logNativeEvent("biometric", "enable started");
  const availability = await m.NativeBiometric.isAvailable({ useFallback: true });
  logNativeEvent("biometric", "enable availability", availability);
  if (!availability.isAvailable) {
    throw new Error(
      `Face ID is not available on this iPhone${availability.errorCode ? ` (${availability.errorCode})` : ""}.`,
    );
  }
  await m.NativeBiometric.verifyIdentity({
    reason: "Enable Face ID for quick sign-in",
    title: "Enable Face ID",
    subtitle: "Confirm it's you to save this device.",
    useFallback: true,
    fallbackTitle: "Use Passcode",
  });
  logNativeEvent("biometric", "enable identity verified");
  await m.NativeBiometric.setCredentials({
    username: USERNAME,
    password: phone,
    server: SERVER,
    accessControl: m.AccessControl.BIOMETRY_ANY,
    title: "Protect Face ID sign-in",
    negativeButtonText: "Cancel",
  });
  const saved = await m.NativeBiometric.isCredentialsSaved({ server: SERVER });
  logNativeEvent("biometric", "credentials saved", saved);
  if (!saved.isSaved) {
    throw new Error("Face ID could not save credentials on this iPhone.");
  }
  window.localStorage.setItem(ENABLED_KEY, "1");
}

/** Prompt Face ID and return the stored phone, or null if unavailable / cancelled. */
export async function signInWithBiometric(): Promise<string | null> {
  const radiant = await checkRadiantBiometrics();
  if (radiant?.available) {
    const phone = await getStoredRadiantPhone();
    if (!isBiometricEnabled() && !phone) return null;
    if (!phone) throw new Error("Face ID is enabled but this iPhone has no saved phone. Sign in with OTP once to re-enable it.");
    const ok = await authenticateRadiantBiometrics("Sign in to Radiant Guard");
    if (!ok) return null;
    if (typeof window !== "undefined") window.localStorage.setItem(ENABLED_KEY, "1");
    return phone;
  }

  const m = await mod();
  if (!m) return null;
  try {
    logNativeEvent("biometric", "sign-in started");
    const saved = await m.NativeBiometric.isCredentialsSaved({ server: SERVER });
    logNativeEvent("biometric", "sign-in saved check", saved);
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
      logNativeEvent("biometric", "secure credentials read");
    } catch (secureErr) {
      logNativeEvent("biometric", "secure credentials read failed; trying legacy fallback", {
        error: secureErr instanceof Error ? secureErr.message : String(secureErr),
      });
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
      logNativeEvent("biometric", "legacy credentials read after identity verification");
    }
    if (creds?.password && typeof window !== "undefined") {
      window.localStorage.setItem(ENABLED_KEY, "1");
    }
    return creds?.password ?? null;
  } catch (err) {
    logNativeEvent("biometric", "sign-in failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function disableBiometric(): Promise<void> {
  if (isNativePlatform()) {
    try {
      await RadiantNativeAuthStore.clearPhone();
      logNativeEvent("biometric", "native stored phone cleared");
    } catch {
      /* noop */
    }
  }

  const m = await mod();
  if (m) {
    try {
      await m.NativeBiometric.deleteCredentials({ server: SERVER });
      logNativeEvent("biometric", "credentials deleted");
    } catch {
      /* noop */
    }
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(ENABLED_KEY);
}
