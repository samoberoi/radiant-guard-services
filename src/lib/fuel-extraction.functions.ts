import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PhotoSchema = z.object({
  label: z.enum(["odometer", "pump", "receipt", "filling"]),
  dataUrl: z.string().min(20).max(15_000_000),
});

const InputSchema = z.object({
  photos: z.array(PhotoSchema).min(1).max(4),
});

export type FuelExtraction = {
  fuel_type: string;
  odometer_km: number | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  location_text: string;
  entry_date: string;
  entry_time: string;
  payment_mode: string;
  notes: string;
};

const SYSTEM_PROMPT = `You are an expert at reading Indian fuel station receipts, fuel pump displays, and vehicle odometer photos.
You will be given 1-4 photos labeled odometer, pump, receipt, or filling. Extract structured fuel entry data.

Rules:
- vehicle odometer photo -> odometer_km (integer kilometers, ignore trip meter)
- fuel pump display -> quantity (liters/kg), rate (per unit), amount (total)
- receipt -> date, time, location/station name, payment mode, fuel type, and any of quantity/rate/amount
- fuel_type: one of "Petrol", "Diesel", "CNG", "Electric" or ""
- payment_mode: one of "Cash", "UPI", "PetroCard", "Other" or ""
- entry_date: YYYY-MM-DD or ""
- entry_time: HH:MM (24h) or ""
- Numbers must be plain numbers (no commas, no currency symbols). Use null if not visible.
- location_text: short station name + city if visible, else ""
- notes: any extra useful info (invoice no, attendant), keep short

Respond ONLY with a single JSON object matching the schema. No prose, no markdown fences.`;

export const extractFuelFromPhotos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<FuelExtraction> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract fuel entry fields from these photos. Return JSON only." },
    ];
    for (const p of data.photos) {
      content.push({ type: "text", text: `Photo label: ${p.label}` });
      content.push({ type: "image_url", image_url: { url: p.dataUrl } });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fuel_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                fuel_type: { type: "string" },
                odometer_km: { type: ["number", "null"] },
                quantity: { type: ["number", "null"] },
                rate: { type: ["number", "null"] },
                amount: { type: ["number", "null"] },
                location_text: { type: "string" },
                entry_date: { type: "string" },
                entry_time: { type: "string" },
                payment_mode: { type: "string" },
                notes: { type: "string" },
              },
              required: [
                "fuel_type",
                "odometer_km",
                "quantity",
                "rate",
                "amount",
                "location_text",
                "entry_date",
                "entry_time",
                "payment_mode",
                "notes",
              ],
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI rate limit reached, try again in a minute");
      if (res.status === 402) throw new Error("AI credits exhausted — top up Lovable AI credits");
      throw new Error(`AI extraction failed (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<FuelExtraction> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    return {
      fuel_type: parsed.fuel_type ?? "",
      odometer_km: parsed.odometer_km ?? null,
      quantity: parsed.quantity ?? null,
      rate: parsed.rate ?? null,
      amount: parsed.amount ?? null,
      location_text: parsed.location_text ?? "",
      entry_date: parsed.entry_date ?? "",
      entry_time: parsed.entry_time ?? "",
      payment_mode: parsed.payment_mode ?? "",
      notes: parsed.notes ?? "",
    };
  });
