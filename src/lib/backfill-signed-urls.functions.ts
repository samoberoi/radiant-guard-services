import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function extractPath(url: string, bucket: string): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.includes("/object/sign/")) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

export const backfillSignedUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin_user");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (s: string) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        update: (v: Record<string, unknown>) => { eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }> };
      };
      storage: {
        from: (b: string) => {
          createSignedUrl: (path: string, exp: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
        };
      };
    };

    async function sign(bucket: string, path: string): Promise<string | null> {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, TEN_YEARS);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    }

    const report = {
      candidates: { scanned: 0, updated: 0, fields: 0, errors: [] as string[] },
      vehicle_fuel_entries: { scanned: 0, updated: 0, fields: 0, errors: [] as string[] },
    };

    // ---- candidates ----
    const cRes = await admin.from("candidates").select("id, photo_url, aadhaar_image_url, signature_url, pan_image_url");
    if (cRes.error) throw new Error(cRes.error.message);
    for (const row of cRes.data ?? []) {
      report.candidates.scanned++;
      const update: Record<string, string> = {};
      for (const field of ["photo_url", "aadhaar_image_url", "signature_url", "pan_image_url"]) {
        const url = row[field] as string | null;
        const path = url ? extractPath(url, "candidate-files") : null;
        if (!path) continue;
        const signed = await sign("candidate-files", path);
        if (signed) {
          update[field] = signed;
          report.candidates.fields++;
        } else {
          report.candidates.errors.push(`${row.id}.${field}:${path}`);
        }
      }
      if (Object.keys(update).length) {
        const { error } = await admin.from("candidates").update(update).eq("id", row.id as string);
        if (error) report.candidates.errors.push(`${row.id}: ${error.message}`);
        else report.candidates.updated++;
      }
    }

    // ---- vehicle_fuel_entries ----
    const fRes = await admin.from("vehicle_fuel_entries").select("*");
    if (fRes.error) throw new Error(fRes.error.message);
    const rows = fRes.data ?? [];
    const urlCols = rows[0] ? Object.keys(rows[0]).filter((k) => /url|proof|image|photo/i.test(k)) : [];
    for (const row of rows) {
      report.vehicle_fuel_entries.scanned++;
      const update: Record<string, string> = {};
      for (const field of urlCols) {
        const url = row[field];
        const path = typeof url === "string" ? extractPath(url, "vehicle-fuel-proofs") : null;
        if (!path) continue;
        const signed = await sign("vehicle-fuel-proofs", path);
        if (signed) {
          update[field] = signed;
          report.vehicle_fuel_entries.fields++;
        } else {
          report.vehicle_fuel_entries.errors.push(`${row.id}.${field}:${path}`);
        }
      }
      if (Object.keys(update).length) {
        const { error } = await admin.from("vehicle_fuel_entries").update(update).eq("id", row.id as string);
        if (error) report.vehicle_fuel_entries.errors.push(`${row.id}: ${error.message}`);
        else report.vehicle_fuel_entries.updated++;
      }
    }

    return report;
  });
