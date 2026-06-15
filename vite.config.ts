import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "vercel",
    vercel: {
      config: {
        // Vercel's default serverless timeout is 10s (Hobby) / 15s (Pro).
        // Attendance OCR on a full muster sheet can take 30–60s, which
        // exceeds the default and causes "failed to fetch" on Vercel only.
        functions: {
          maxDuration: 120,
        },
      },
    },
  },
});
