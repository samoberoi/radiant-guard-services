import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  photos: z
    .array(
      z.object({
        label: z.enum(["odometer", "pump", "receipt", "filling"]),
        dataUrl: z.string().min(20).max(20_000_000),
      }),
    )
    .min(1)
    .max(4),
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

const SYSTEM_PROMPT = `You are an OCR + data-extraction engine for an Indian fuel station refuelling event.
You will receive 1–4 photos labelled as one of: "odometer" (the car dashboard odometer), "pump" (the fuel pump display showing units, rate, amount), "receipt" (printed pump receipt), "filling" (a photo of the nozzle inserted in the car).
Combine evidence across all photos and return ONLY a strict JSON object with EXACTLY these keys:
{
  "fuel_type": "Petrol | Diesel | CNG | Electric | \"\"",
  "odometer_km": number | null,
  "quantity": number | null,          // litres for petrol/diesel, kg for CNG
  "rate": number | null,              // INR per litre/kg
  "amount": number | null,            // total INR
  "location_text": "pump name / area as printed, else \"\"",
  "entry_date": "YYYY-MM-DD or \"\"",
  "entry_time": "HH:MM (24h) or \"\"",
  "payment_mode": "PetroCard | Cash | UPI | Other | \"\"",
  "notes": "short helpful note, else \"\""
}
Rules:
- Use null when a numeric field is not clearly visible. Never guess.
- amount, rate, quantity should be consistent (amount ≈ quantity × rate) when all three appear; if only two are visible, leave the third null.
- Strip currency symbols and commas from numbers.
- Use the receipt and pump photos as the primary source for fuel data; use the odometer photo only for odometer_km.
- Output JSON only — no markdown, no commentary.`;

function dataUrlToInlinePart(dataUrl: string): { inline_data: { mime_type: string; data: string } } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

export const extractFuelFromPhotos = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<FuelExtraction> => {
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const parts: Array<Record<string, unknown>> = [];
    for (const p of data.photos) {
      parts.push({ text: `Photo label: ${p.label}` });
      parts.push(dataUrlToInlinePart(p.dataUrl));
    }
    parts.push({
      text: "Extract the fuelling event details from the labelled photos above and return JSON as specified.",
    });

    const model = "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content =
      json.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "{}";

    let parsed: Partial<FuelExtraction> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* noop */ }
      }
    }

    const num = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const str = (v: unknown): string => String(v ?? "").trim();
    const fuel = str(parsed.fuel_type);
    const validFuel = ["Petrol", "Diesel", "CNG", "Electric"].includes(fuel) ? fuel : "";
    const pay = str(parsed.payment_mode);
    const validPay = ["PetroCard", "Cash", "UPI", "Other"].includes(pay) ? pay : "";
    const date = str(parsed.entry_date);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
    const time = str(parsed.entry_time);
    const validTime = /^\d{2}:\d{2}$/.test(time) ? time : "";

    return {
      fuel_type: validFuel,
      odometer_km: num(parsed.odometer_km),
      quantity: num(parsed.quantity),
      rate: num(parsed.rate),
      amount: num(parsed.amount),
      location_text: str(parsed.location_text),
      entry_date: validDate,
      entry_time: validTime,
      payment_mode: validPay,
      notes: str(parsed.notes),
    };
  });
