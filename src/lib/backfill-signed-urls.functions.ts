import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function extractPath(url: string, bucket: string): string | null {
  if (!url || typeof url !== "string") return null;
  // Already a signed URL — leave it.
  if (url.includes("/object/sign/")) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  // Strip any query string.
  return url.slice(idx + marker.length).split("?")[0];
}

async function sign(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  bucket: string,
  path: string,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, TEN_YEARS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const backfillSignedUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Authorize: admin only
    const { data: isAdmin } = await context.supabase.rpc("is_admin_user");
    if (!isAdmin) throw new Error("Forbidden");

    const admin = await getAdmin();
    const report = {
      candidates: { scanned: 0, updated: 0, fields: 0, errors: [] as string[] },
      vehicle_fuel_entries: { scanned: 0, updated: 0, fields: 0, errors: [] as string[] },
    };

    // ---- candidates ----
    const { data: candidates, error: cErr } = await admin
      .from("candidates")
      .select("id, photo_url, aadhaar_image_url, signature_url, pan_image_url");
    if (cErr) throw cErr;

    for (const row of candidates ?? []) {
      report.candidates.scanned++;
      const update: Record<string, string> = {};
      for (const field of ["photo_url", "aadhaar_image_url", "signature_url", "pan_image_url"] as const) {
        const url = (row as Record<string, unknown>)[field] as string | null;
        const path = url ? extractPath(url, "candidate-files") : null;
        if (!path) continue;
        const signed = await sign(admin, "candidate-files", path);
        if (signed) {
          update[field] = signed;
          report.candidates.fields++;
        } else {
          report.candidates.errors.push(`${row.id}.${field}:${path}`);
        }
      }
      if (Object.keys(update).length) {
        const { error: uErr } = await admin.from("candidates").update(update).eq("id", row.id);
        if (uErr) report.candidates.errors.push(`${row.id}: ${uErr.message}`);
        else report.candidates.updated++;
      }
    }

    // ---- vehicle_fuel_entries (proof images) ----
    const { data: fuelCols } = await admin.rpc("nextval", { sequence_name: "vehicle_code_seq" }).then(() => ({ data: null })).catch(() => ({ data: null }));
    void fuelCols;
    const { data: fuel, error: fErr } = await admin
      .from("vehicle_fuel_entries")
      .select("*")
      .limit(10000);
    if (fErr) throw fErr;

    // discover url-ish columns on first row
    const urlCols = fuel && fuel[0]
      ? Object.keys(fuel[0]).filter((k) => /url|proof|image|photo/i.test(k))
      : [];

    for (const row of fuel ?? []) {
      report.vehicle_fuel_entries.scanned++;
      const update: Record<string, string> = {};
      for (const field of urlCols) {
        const url = (row as Record<string, unknown>)[field] as string | null;
        const path = url && typeof url === "string" ? extractPath(url, "vehicle-fuel-proofs") : null;
        if (!path) continue;
        const signed = await sign(admin, "vehicle-fuel-proofs", path);
        if (signed) {
          update[field] = signed;
          report.vehicle_fuel_entries.fields++;
        } else {
          report.vehicle_fuel_entries.errors.push(`${row.id}.${field}:${path}`);
        }
      }
      if (Object.keys(update).length) {
        const { error: uErr } = await admin
          .from("vehicle_fuel_entries")
          .update(update)
          .eq("id", row.id);
        if (uErr) report.vehicle_fuel_entries.errors.push(`${row.id}: ${uErr.message}`);
        else report.vehicle_fuel_entries.updated++;
      }
    }

    return report;
  });
