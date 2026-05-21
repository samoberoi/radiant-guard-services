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

const SYSTEM_PROMPT = `You are an expert at reading Indian fuel station receipts (HPCL, IOCL, BPCL, Shell, Reliance), fuel pump displays, and vehicle odometer photos.
You will be given 1-4 photos labeled odometer, pump, receipt, or filling. Extract structured fuel entry data.

CRITICAL field mapping — labels and right-aligned values on thermal receipts are often visually offset. Read the LABEL on each line, not just position:
- AMOUNT / TOTAL / NET AMOUNT / SALE AMT  -> "amount"   (total rupees, usually the LARGEST number, e.g. 4578.48)
- RSP / RATE / UNIT PRICE / PRICE/LTR     -> "rate"     (per litre/kg, typically 80-110 in India, e.g. 94.13)
- VOLUME / QTY / QUANTITY / LITRES / VOL  -> "quantity" (litres or kg, e.g. 48.640)
- BALANCE / PREV BAL                       -> IGNORE (never put in any field)
- ODOMETER                                 -> "odometer_km" (integer km, ignore trip meter)

SANITY CHECK before responding: quantity × rate must ≈ amount (within ~2 rupees). If it doesn't, you have swapped fields — re-read carefully. On an HPCL DriveTrack receipt the printed order is AMOUNT, RSP, VOLUME, BALANCE.

Other rules:
- fuel_type from PRODUCT line: "Petrol", "Diesel", "CNG", "Electric", or ""
- payment_mode: "PetroCard" if a fleet card name (DriveTrack/SmartFleet/XtraPower) is shown, else "UPI"/"Cash"/"Other"/""
- entry_date YYYY-MM-DD. Indian receipts use DD/MM/YY — convert correctly (21/05/26 -> 2026-05-21)
- entry_time HH:MM 24h
- location_text: station name + city (e.g. "Krishna Shiv Petroleum, Dombivali")
- Numbers must be plain — no commas, no ₹/Rs. Use null only if truly not visible.
- notes: brief extras (batch no, txn id)

Use the record_fuel_entry tool to return the data.`;

export const extractFuelFromPhotos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<FuelExtraction> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) {
      throw new Error(
        "AI extraction is not available right now because the backend AI key is missing on the server",
      );
    }

    let text = "{}";

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
      throw new Error(`AI extraction failed (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    text = toolCall?.function?.arguments ?? json?.choices?.[0]?.message?.content ?? "{}";


    let parsed: Partial<FuelExtraction> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    let { quantity, rate, amount } = {
      quantity: parsed.quantity ?? null,
      rate: parsed.rate ?? null,
      amount: parsed.amount ?? null,
    };

    // Sanity-correct field swaps. In India: rate ~80-110, quantity usually < rate,
    // amount is usually the largest of the three.
    const nums = [quantity, rate, amount].filter(
      (n): n is number => typeof n === "number" && isFinite(n) && n > 0,
    );
    if (nums.length === 3 && quantity && rate && amount) {
      const expected = quantity * rate;
      const ok = Math.abs(expected - amount) <= Math.max(2, amount * 0.02);
      if (!ok) {
        // Try every permutation; pick one where q*r ≈ a and rate is in [50, 150]
        const perms: Array<[number, number, number]> = [
          [quantity, rate, amount],
          [quantity, amount, rate],
          [rate, quantity, amount],
          [rate, amount, quantity],
          [amount, quantity, rate],
          [amount, rate, quantity],
        ];
        let best: { q: number; r: number; a: number; err: number } | null = null;
        for (const [q, r, a] of perms) {
          if (r < 50 || r > 150) continue;
          const err = Math.abs(q * r - a);
          if (err <= Math.max(2, a * 0.02) && (!best || err < best.err)) {
            best = { q, r, a, err };
          }
        }
        if (best) {
          quantity = best.q;
          rate = best.r;
          amount = best.a;
          console.log("[fuel-extract] corrected swapped fields", best);
        }
      }
    }

    return {
      fuel_type: parsed.fuel_type ?? "",
      odometer_km: parsed.odometer_km ?? null,
      quantity,
      rate,
      amount,
      location_text: parsed.location_text ?? "",
      entry_date: parsed.entry_date ?? "",
      entry_time: parsed.entry_time ?? "",
      payment_mode: parsed.payment_mode ?? "",
      notes: parsed.notes ?? "",
    };
  });
