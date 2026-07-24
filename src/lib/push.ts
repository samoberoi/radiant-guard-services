/**
 * APNs push registration for iOS (Capacitor).
 *
 * On native platforms, requests permission, registers with APNs, and stores
 * the resulting device token in `public.device_push_tokens` so backend jobs
 * can target the signed-in user. Safe no-op on web.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNativePlatform } from "./native";
import { playNotificationChime } from "./notification-sound";

let initialized = false;
let initPromise: Promise<void> | null = null;
let lastApnsToken: string | null = null;
let lastPermission: string | null = null;
let lastError: string | null = null;
let authSyncAttached = false;

type PushRegisterResult = {
  supported: boolean;
  permission: string | null;
  tokenSaved: boolean;
  tokenSuffix: string | null;
  message: string;
};

async function saveTokenForSignedInUser(token: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    lastError = "Sign in first, then register this iPhone for push notifications.";
    console.warn("[push] no signed-in user; token not stored");
    return false;
  }

  const { error } = await supabase.from("device_push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform: "ios",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    lastError = error.message;
    console.warn("[push] failed to store token", error);
    return false;
  }

  lastError = null;
  console.info("[push] APNs token stored", token.slice(-8));
  return true;
}

function attachAuthTokenSync() {
  if (authSyncAttached) return;
  authSyncAttached = true;
  supabase.auth.onAuthStateChange((event) => {
    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "INITIAL_SESSION"
    ) {
      if (lastApnsToken) {
        void saveTokenForSignedInUser(lastApnsToken);
      } else if (initialized && isNativePlatform()) {
        void registerPushForCurrentUser();
      }
    }
  });
}

export async function initPushNotifications(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = initPushNotificationsOnce();
  return initPromise;
}

async function initPushNotificationsOnce(): Promise<void> {
  if (initialized) return;
  if (!isNativePlatform()) return;
  initialized = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    attachAuthTokenSync();

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive;
    if (granted === "prompt" || granted === "prompt-with-rationale") {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive;
    }
    lastPermission = granted;
    if (granted !== "granted") {
      lastError = `Push permission is ${granted}. Enable notifications for Radiant Guard in iOS Settings.`;
      console.warn("[push] permission not granted:", granted);
      return;
    }

    await Promise.all([
      PushNotifications.addListener("registration", async (token) => {
        console.info("[push] APNs token registered", token.value.slice(-8));
        lastApnsToken = token.value;
        await saveTokenForSignedInUser(token.value);
      }),
      PushNotifications.addListener("registrationError", (err) => {
        lastError = err?.error || JSON.stringify(err);
        console.warn("[push] registration error", err);
      }),
      // Foreground: iOS does NOT show a system banner or play a sound when the
      // app is open. We handle it in-app: play a chime and show a toast that
      // links to the deep-link target if provided.
      PushNotifications.addListener("pushNotificationReceived", (notif) => {
        try {
          playNotificationChime();
        } catch {
          /* noop */
        }
        const title = notif.title || "Radiant Guard";
        const body = notif.body || "";
        const link = (notif.data as { link?: string } | undefined)?.link;
        toast(title, {
          description: body,
          action: link
            ? {
                label: "Open",
                onClick: () => {
                  if (link.startsWith("/")) window.location.href = link;
                },
              }
            : undefined,
        });
      }),
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const link = (action.notification.data as { link?: string } | undefined)?.link;
        if (link && typeof window !== "undefined" && link.startsWith("/")) {
          window.location.href = link;
        }
      }),
    ]);

    await PushNotifications.register();
    console.info("[push] register() called");
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.warn("[push] init failed", err);
  }
}

export async function registerPushForCurrentUser(): Promise<PushRegisterResult> {
  if (!isNativePlatform()) {
    return {
      supported: false,
      permission: null,
      tokenSaved: false,
      tokenSuffix: null,
      message: "Open the installed iOS app to register Apple push notifications.",
    };
  }

  await initPushNotifications();

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    lastPermission = perm.receive;
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      lastPermission = req.receive;
    }
    if (lastPermission === "granted") {
      await PushNotifications.register();
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  const tokenSaved = lastApnsToken ? await saveTokenForSignedInUser(lastApnsToken) : false;
  return {
    supported: true,
    permission: lastPermission,
    tokenSaved,
    tokenSuffix: lastApnsToken ? lastApnsToken.slice(-8) : null,
    message: tokenSaved
      ? "This iPhone is registered for Apple push notifications."
      : lastError || "Apple push registration has started. Try again in a few seconds.",
  };
}
