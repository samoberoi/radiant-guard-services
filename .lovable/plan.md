## Goal

Add a phone + OTP login flow to this TanStack Start project, styled with the Radiant_New design language (warm ivory background, deep navy text, gold accent, Space Grotesk / Poppins / Montserrat type, glass cards, gold glow). OTP is hardcoded to `111111`. After login, show a welcome screen with a logout button.

## Design system port

Radiant_New uses Tailwind v3 with HSL tokens. This project uses Tailwind v4 with oklch tokens in `src/styles.css`. I'll translate Radiant's palette into the existing `@theme inline` / `:root` / `.dark` blocks so the rest of the app stays consistent:

- background: warm ivory (Radiant `30 15% 96%`)
- foreground: deep navy (`220 30% 5%`)
- primary: deep navy
- accent: gold (`43 54% 55%`) — used for OTP focus ring, button, glow
- secondary accent: cool blue (`200 70% 45%`)
- radius: `1rem`
- Add Google Font import for Montserrat / Poppins / Space Grotesk
- Add a few utility classes: `.glass`, `.font-heading`, `.text-gradient-accent`, `.glow-accent`, `.hero-glow`

Values converted to oklch equivalents so they slot into the existing token structure.

## Routes

```
src/routes/
  index.tsx              -> redirect: if authed go /welcome else /login
  login.tsx              -> phone + OTP login (public)
  welcome.tsx            -> welcome message + logout button (guarded)
```

Replace the placeholder in `index.tsx` with a small client-side redirect based on auth state.

## Auth state (dummy)

No backend yet. A tiny `src/lib/auth.ts` module:

- stores `{ phone }` in `localStorage` under `radiant.auth`
- exports `useAuth()` hook returning `{ user, login(phone), logout() }`
- subscribes to storage events so multiple tabs stay in sync

OTP check is a pure client function: `verifyOtp(code) => code === "111111"`. A clear `// TODO: replace with real OTP provider` comment is left in place.

## Login page UX

Two-step flow inside one card:

1. **Phone step**
   - Country code selector (default `+91`) + 10-digit phone input
   - Validates length, enables "Send OTP" button
   - On submit: simulate a 600ms delay (toast: "OTP sent to ••• ••• 1234"), advance to OTP step

2. **OTP step**
   - 6-digit OTP input using existing `src/components/ui/input-otp.tsx`
   - "Verify" button. If `111111` → call `login(phone)` and navigate to `/welcome`. Else show inline error + shake animation.
   - "Change number" link returns to step 1
   - "Resend OTP" link with 30s countdown
   - Helper text: "Use 111111 for demo"

Visual treatment:

- Full-viewport split: left = brand panel (Radiant logo wordmark, tagline, ambient gold glow, subtle dot pattern); right = glass card with the form
- On mobile: single column, brand panel collapses to a slim header
- Gold accent on focus rings, primary CTA uses navy bg with gold hover glow
- Uses `sonner` (already in project) for toasts

## Welcome page

- Centered glass card on the same ambient background
- Heading: "Welcome to Radiant Guard Services"
- Subtext shows the logged-in phone number (masked)
- "Sign out" button (outline style) → calls `logout()` and navigates to `/login`
- Guard: if no user in localStorage, redirect to `/login` on mount

## Files to add / change

- `src/styles.css` — extend tokens (accent gold, fonts), add utility classes
- `src/routes/__root.tsx` — add Google Fonts `<link>` in `head()`, update title to "Radiant Guard Services"
- `src/routes/index.tsx` — replace placeholder with auth-aware redirect
- `src/routes/login.tsx` — new
- `src/routes/welcome.tsx` — new
- `src/lib/auth.ts` — new (localStorage-backed dummy auth)
- `src/components/BrandMark.tsx` — new (small Radiant wordmark used on login + welcome)

No new dependencies needed — `input-otp`, `sonner`, `lucide-react` are already present.

## Out of scope (flagged for later)

- Real SMS OTP provider (Twilio / MSG91 / Supabase phone auth)
- Server-side session, rate limiting, OTP expiry
- Profile data / roles
