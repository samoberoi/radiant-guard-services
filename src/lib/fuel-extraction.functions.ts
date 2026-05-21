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
    const lovableKey = process.env.LOVABLE_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    console.log("[fuel-extract] keys present:", {
      lovable: !!lovableKey,
      gemini: !!geminiKey,
    });
    if (!lovableKey && !geminiKey) {
      throw new Error(
        "AI service not configured — LOVABLE_API_KEY and GEMINI_API_KEY both missing on server",
      );
    }

    let text = "{}";

    // Use OpenAI GPT-5 via Lovable AI Gateway (better vision accuracy for receipts)
    if (lovableKey) {
      const content: Array<Record<string, unknown>> = [
        { type: "text", text: "Extract fuel entry fields from these photos. Be precise — read every digit carefully and double-check numbers. Use the provided tool to return the data." },
      ];
      for (const p of data.photos) {
        content.push({ type: "text", text: `Photo label: ${p.label}` });
        content.push({ type: "image_url", image_url: { url: p.dataUrl } });
      }

      const extractionTool = {
        type: "function",
        function: {
          name: "record_fuel_entry",
          description: "Record the extracted fuel entry data from the provided photos.",
          parameters: {
            type: "object",
            properties: {
              fuel_type: { type: "string", enum: ["Petrol", "Diesel", "CNG", "Electric", ""] },
              odometer_km: { type: ["number", "null"], description: "Integer km from vehicle odometer (not trip meter)" },
              quantity: { type: ["number", "null"], description: "Liters or kg dispensed" },
              rate: { type: ["number", "null"], description: "Price per unit" },
              amount: { type: ["number", "null"], description: "Total amount paid" },
              location_text: { type: "string", description: "Station name + city" },
              entry_date: { type: "string", description: "YYYY-MM-DD or empty" },
              entry_time: { type: "string", description: "HH:MM 24h or empty" },
              payment_mode: { type: "string", enum: ["Cash", "UPI", "PetroCard", "Other", ""] },
              notes: { type: "string" },
            },
            required: ["fuel_type", "odometer_km", "quantity", "rate", "amount", "location_text", "entry_date", "entry_time", "payment_mode", "notes"],
            additionalProperties: false,
          },
        },
      };

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-5",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
          tools: [extractionTool],
          tool_choice: { type: "function", function: { name: "record_fuel_entry" } },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[fuel-extract] lovable gateway error", res.status, txt.slice(0, 300));
        if (res.status === 429) throw new Error("AI rate limit reached, try again in a minute");
        if (res.status === 402) throw new Error("AI credits exhausted — top up Lovable AI credits");
        if (!geminiKey) {
          throw new Error(`AI extraction failed (${res.status}): ${txt.slice(0, 200)}`);
        }
      } else {
        const json = await res.json();
        const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
        text = toolCall?.function?.arguments ?? json?.choices?.[0]?.message?.content ?? "{}";
      }
    }

    if (text === "{}" && geminiKey) {
      const parts: Array<Record<string, unknown>> = [
        { text: `${SYSTEM_PROMPT}\n\nExtract fuel entry fields from these photos. Return JSON only.` },
      ];
      for (const p of data.photos) {
        const m = p.dataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!m) continue;
        parts.push({ text: `Photo label: ${p.label}` });
        parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[fuel-extract] gemini error", res.status, txt.slice(0, 300));
        if (res.status === 429) throw new Error("AI rate limit reached, try again in a minute");
        throw new Error(`AI extraction failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      text =
        json?.candidates?.[0]?.content?.parts
          ?.map((x: { text?: string }) => x?.text ?? "")
          .join("") ?? "{}";
    }


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
