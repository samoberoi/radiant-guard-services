import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20).max(15_000_000),
});

export type AadhaarExtraction = {
  full_name: string;
  date_of_birth: string;
  gender: string;
  aadhaar_number: string;
  address: string;
  birthplace: string;
};

const SYSTEM_PROMPT = `You are an OCR engine that extracts data from a scanned Indian Aadhaar card image. Return ONLY a strict JSON object with these keys: full_name, date_of_birth (YYYY-MM-DD), gender (Male|Female|Other), aadhaar_number (12 digits, no spaces), address (full single-line), birthplace (city or village). If a field is not visible, use an empty string. Do not include any commentary.`;

export const extractAadhaar = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AadhaarExtraction> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

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
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the Aadhaar fields from this card." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<AadhaarExtraction> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // try to extract a JSON block
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* noop */
        }
      }
    }
    return {
      full_name: String(parsed.full_name ?? ""),
      date_of_birth: String(parsed.date_of_birth ?? ""),
      gender: String(parsed.gender ?? ""),
      aadhaar_number: String(parsed.aadhaar_number ?? "").replace(/\D/g, ""),
      address: String(parsed.address ?? ""),
      birthplace: String(parsed.birthplace ?? ""),
    };
  });
