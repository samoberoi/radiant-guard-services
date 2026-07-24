/**
 * APNs push registration for iOS (Capacitor).
 *
 * On native platforms, requests permission, registers with APNs, and stores
 * the resulting device token in `public.device_push_tokens` so backend jobs
 * can target the signed-in user. Safe no-op on web.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNativePlatform } from "./native";

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
    if (granted !== "granted") return;

    PushNotifications.addListener("registration", async (token) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
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

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = (action.notification.data as { link?: string } | undefined)?.link;
      if (link && typeof window !== "undefined" && link.startsWith("/")) {
        window.location.href = link;
      }
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn("[push] init failed", err);
  }
}
