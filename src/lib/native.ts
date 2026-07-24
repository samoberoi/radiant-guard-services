/**
 * Native runtime bridge for Capacitor (iOS / Android).
 *
 * Safe to import from browser-only code. All plugin work is dynamic-imported
 * inside `initNative()` so nothing runs during SSR and web-only builds don't
 * pay the cost when Capacitor isn't present.
 */

let initialized = false;

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor injects window.Capacitor in the WebView.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export async function initNative(): Promise<void> {
  if (initialized) return;
  if (typeof window === "undefined") return;
  if (!isNativePlatform()) return;
  initialized = true;

  try {
    const [{ StatusBar, Style }, { SplashScreen }, { Keyboard, KeyboardResize }, { App }] =
      await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/keyboard"),
        import("@capacitor/app"),
      ]);

    // Status bar: match app theme, do NOT overlay the web view so safe-area
    // insets from CSS env() still work as expected.
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    } catch {
      /* iOS ignores setBackgroundColor — safe to swallow */
    }

    // Hide launch splash quickly once the JS bundle is ready.
    try {
      await SplashScreen.hide();
    } catch {
      /* noop */
    }

    // Keep native keyboard from covering inputs; also expose height as a
    // CSS variable so forms can reserve space.
    try {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      await Keyboard.setScroll({ isDisabled: false });
      Keyboard.addListener("keyboardWillShow", (info) => {
        document.documentElement.style.setProperty(
          "--keyboard-height",
          `${info.keyboardHeight}px`,
        );
        document.documentElement.setAttribute("data-keyboard", "open");
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.style.setProperty("--keyboard-height", "0px");
        document.documentElement.removeAttribute("data-keyboard");
      });
    } catch {
      /* noop */
    }

    // Hardware back button on Android: navigate back in history or exit.
    try {
      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
    } catch {
      /* noop */
    }
  } catch (err) {
    // Never let native init crash the web app.
    console.warn("[native] initialization failed", err);
  }

  // Push notifications (APNs on iOS). Fire-and-forget; failures are logged.
  try {
    const { initPushNotifications } = await import("./push");
    void initPushNotifications();
  } catch {
    /* noop */
  }
}
