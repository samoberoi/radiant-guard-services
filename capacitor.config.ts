import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Radiant Guard Services.
 *
 * TanStack Start is a server-rendered framework, so the native shell loads
 * the published web app via `server.url` (hybrid mode) instead of bundling
 * static assets. Point `server.url` at your published Lovable URL — or a
 * custom domain — and rebuild the native project with `npx cap sync`.
 *
 * For a purely offline/static build you'd need to pre-render the app to
 * `dist/` and remove `server.url`; that is a separate migration.
 */
const config: CapacitorConfig = {
  appId: "app.lovable.radiantguard",
  appName: "Radiant Guard",
  webDir: "dist",
  server: {
    // Change to your custom domain in production.
    url: "https://radiant-guard-services.lovable.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
