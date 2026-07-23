# Mobile (iOS / Android) — Capacitor

The app is packaged natively with [Capacitor](https://capacitorjs.com). It
runs as a hybrid app: the native shell loads the published Lovable web app
(TanStack Start SSR) via `server.url` in `capacitor.config.ts`.

## One-time setup (on your Mac / dev machine)

Requirements:

- Node 20+, Bun, Xcode 15+ (iOS), Android Studio (Android)
- CocoaPods (`sudo gem install cocoapods`)

```bash
# From project root, after cloning:
bun install

# Create the native platform folders (only needed once):
npx cap add ios
npx cap add android

# Copy web config into the native projects:
npx cap sync
```

## Point the app at your production URL

Open `capacitor.config.ts` and update `server.url` to the URL you want the
mobile app to load. Defaults to `https://radiant-guard-services.lovable.app`.

For a custom domain, change it and re-run `npx cap sync`.

## Running

```bash
# iOS (opens Xcode)
npx cap open ios

# Android (opens Android Studio)
npx cap open android
```

Then Run in Xcode / Android Studio on a simulator or device.

## What's already wired

- Safe-area insets (notch / Dynamic Island / home indicator) via CSS `env()`
- Status bar style + non-overlay (safe-area friendly)
- Splash screen auto-hide
- Native keyboard resize + `--keyboard-height` CSS var + `[data-keyboard=open]`
- Android hardware back button → history back / exit
- 44×44 touch targets and 16px minimum input font (no iOS auto-zoom)

Runtime initialisation lives in `src/lib/native.ts` and is invoked once from
`src/routes/__root.tsx`. It's a no-op in the browser, so web builds are
unaffected.

## Publishing to the stores

- **iOS** — Xcode → Product → Archive → Distribute App (App Store Connect)
- **Android** — Android Studio → Build → Generate Signed Bundle (AAB)

App identifier: `app.lovable.radiantguard` (change in `capacitor.config.ts`
plus native project settings before submitting).
