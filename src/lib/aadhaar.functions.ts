import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  fileDataUrl: z.string().min(20).max(20_000_000),
  mimeType: z.string().min(3).max(100),
});

export type AadhaarExtraction = {
  full_name: string;
  date_of_birth: string;
  gender: string;
  aadhaar_number: string;
  address_line1: string;
  address_line2: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  birthplace: string;
};

const SYSTEM_PROMPT = `You are an OCR engine that extracts data from a scanned Indian Aadhaar card (front and/or back), supplied as either an image or a PDF.
Return ONLY a strict JSON object with EXACTLY these keys (all strings; use "" if not visible):
{
  "full_name": "as printed",
  "date_of_birth": "YYYY-MM-DD",
  "gender": "Male | Female | Other",
  "aadhaar_number": "12 digits, no spaces",
  "address_line1": "house no, street",
  "address_line2": "area, locality",
  "landmark": "near / opposite (if any)",
  "city": "town or city name",
  "district": "district name",
  "state": "Indian state name (full)",
  "pincode": "6 digit PIN",
  "country": "India",
  "birthplace": "city/village if printed"
}
Carefully parse the address block on the back of the Aadhaar card and split it into the structured fields above. Do not include any commentary or markdown.`;

export const extractAadhaar = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AadhaarExtraction> => {
    const apiKey =
      process.env.LOVABLE_API_KEY ||
      ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.LOVABLE_API_KEY ?? "");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const isPdf = data.mimeType === "application/pdf";

    // Gemini (via Lovable AI Gateway OpenAI-compat) accepts PDFs as image_url data URLs.
    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: isPdf
          ? "Extract the Aadhaar fields and the structured address from this Aadhaar PDF (front and/or back)."
          : "Extract the Aadhaar fields and the structured address from this card image.",
      },
      { type: "image_url", image_url: { url: data.fileDataUrl } },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };
    const rawContent = json.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === "string" ? part.text : ""))
              .join("\n")
          : "{}";
    let parsed: Partial<AadhaarExtraction> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* noop */
        }
      }
    }
    const s = (v: unknown) => String(v ?? "").trim();
    const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const looksLikeName = (value: string) => {
      if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(value)) return false;
      const parts = value.match(/[A-Za-z]+/g) ?? [];
      const meaningfulParts = parts.filter((part) => part.length >= 2);
      return meaningfulParts.length >= 2 && parts.join("").length >= 4;
    };
    const normalizedName = s(parsed.full_name)
      .replace(/\b(name|address|dob|yob|year of birth|gender|male|female)\b\s*[:\-]?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const normalizedDob = s(parsed.date_of_birth);

    return {
      full_name: looksLikeName(normalizedName) ? normalizedName : "",
      date_of_birth: isIsoDate(normalizedDob) ? normalizedDob : "",
      gender: /^(male|female|other)$/i.test(s(parsed.gender)) ? s(parsed.gender) : "",
      aadhaar_number: s(parsed.aadhaar_number).replace(/\D/g, ""),
      address_line1: s(parsed.address_line1),
      address_line2: s(parsed.address_line2),
      landmark: s(parsed.landmark),
      city: s(parsed.city),
      district: s(parsed.district),
      state: s(parsed.state),
      pincode: s(parsed.pincode).replace(/\D/g, "").slice(0, 6),
      country: s(parsed.country) || "India",
      birthplace: s(parsed.birthplace),
    };
  });
