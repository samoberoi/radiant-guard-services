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

let registered = false;

export async function initPushNotifications(): Promise<void> {
  if (registered) return;
  if (!isNativePlatform()) return;
  registered = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive;
    if (granted === "prompt" || granted === "prompt-with-rationale") {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive;
    }
    if (granted !== "granted") {
      console.warn("[push] permission not granted:", granted);
      return;
    }

    PushNotifications.addListener("registration", async (token) => {
      console.info("[push] APNs token registered", token.value.slice(-8));
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.warn("[push] no signed-in user; token not stored");
          return;
        }
        await supabase.from("device_push_tokens").upsert(
          {
            user_id: user.id,
            token: token.value,
            platform: "ios",
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );
      } catch (err) {
        console.warn("[push] failed to store token", err);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] registration error", err);
    });

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
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = (action.notification.data as { link?: string } | undefined)?.link;
      if (link && typeof window !== "undefined" && link.startsWith("/")) {
        window.location.href = link;
      }
    });

    await PushNotifications.register();
    console.info("[push] register() called");
  } catch (err) {
    console.warn("[push] init failed", err);
  }
}
