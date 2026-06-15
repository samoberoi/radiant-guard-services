import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel's default serverless function timeout is 10s (Hobby) / 15s (Pro).
// Attendance OCR on a full muster sheet can take 30–60s, which exceeds
// the default and causes "failed to fetch" on the Vercel deployment only
// (the Lovable preview has no such cap). We bump it to 120s via the
// Nitro vercel preset's passthrough config.
export default defineConfig({
  nitro: {
    preset: "vercel",
    vercel: {
      config: {
        functions: {
          maxDuration: 120,
        },
      },
    },
  } as any,
});
