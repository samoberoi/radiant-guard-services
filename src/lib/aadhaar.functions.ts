import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  fileDataUrl: z.string().min(20).max(20_000_000),
  mimeType: z.string().min(3).max(100),
  pageImageDataUrls: z.array(z.string().min(20).max(20_000_000)).max(3).optional(),
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

const SYSTEM_PROMPT = `You are an OCR engine that extracts data from a scanned Indian Aadhaar card (front and/or back), supplied as either an image or page renders from a PDF.
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
Rules:
- Copy only clearly visible English text from the card.
- If a field is uncertain, garbled, scrambled, or looks like OCR noise, return "" for that field.
- Never guess missing values.
- Never return labels like Name, DOB, Address, UIDAI, Government of India as values.
- For addresses, prefer blank over partial nonsense.
Carefully parse the address block on the back of the Aadhaar card and split it into the structured fields above. Do not include any commentary or markdown.`;

export const extractAadhaar = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AadhaarExtraction> => {
    const apiKey = process.env.LOVABLE_API_KEY ?? "";
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const isPdf = data.mimeType === "application/pdf";
    const pageImages = data.pageImageDataUrls?.filter(Boolean) ?? [];

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          isPdf && pageImages.length
            ? "Extract the Aadhaar fields and the structured address from these Aadhaar page images. Use only what is clearly visible."
            : isPdf
              ? "Extract the Aadhaar fields and the structured address from this Aadhaar PDF. Use only what is clearly visible."
              : "Extract the Aadhaar fields and the structured address from this card image. Use only what is clearly visible.",
      },
      ...(isPdf && pageImages.length
        ? pageImages.map((url) => ({ type: "image_url", image_url: { url } }))
        : [{ type: "image_url", image_url: { url: data.fileDataUrl } }]),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
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
    const clean = (value: string) =>
      value
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    const stripFieldLabels = (value: string) =>
      clean(value).replace(/\b(name|address|dob|date of birth|yob|year of birth|gender|male|female|other|uidai|government of india)\b\s*[:\-]?/gi, "").trim();
    const hasOcrNoise = (value: string) => {
      const next = clean(value);
      if (!next) return false;
      return /[`~^*_={}|<>]/.test(next) || /[;:]{2,}/.test(next) || /\b[il1|]\s*[;:=]\s*/i.test(next);
    };
    const looksLikeName = (value: string) => {
      if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(value)) return false;
      if (hasOcrNoise(value)) return false;
      const parts = value.match(/[A-Za-z]+/g) ?? [];
      const meaningfulParts = parts.filter((part) => part.length >= 2);
      const longestPart = meaningfulParts.reduce((max, part) => Math.max(max, part.length), 0);
      return parts.join("").length >= 4 && (meaningfulParts.length >= 2 || longestPart >= 4);
    };
    const looksLikePlace = (value: string) => /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(clean(value)) && !hasOcrNoise(value);
    const looksLikeAddress = (value: string) => /[A-Za-z]{3,}/.test(clean(value)) && !hasOcrNoise(value);
    const normalizedName = stripFieldLabels(s(parsed.full_name));
    const normalizedDob = clean(s(parsed.date_of_birth));
    const normalizedGender = clean(s(parsed.gender));
    const normalizedAddress1 = stripFieldLabels(s(parsed.address_line1));
    const normalizedAddress2 = stripFieldLabels(s(parsed.address_line2));
    const normalizedLandmark = stripFieldLabels(s(parsed.landmark));
    const normalizedCity = stripFieldLabels(s(parsed.city));
    const normalizedDistrict = stripFieldLabels(s(parsed.district));
    const normalizedState = stripFieldLabels(s(parsed.state));
    const normalizedCountry = stripFieldLabels(s(parsed.country));
    const normalizedBirthplace = stripFieldLabels(s(parsed.birthplace));

    return {
      full_name: looksLikeName(normalizedName) ? normalizedName : "",
      date_of_birth: isIsoDate(normalizedDob) ? normalizedDob : "",
      gender: /^(male|female|other)$/i.test(normalizedGender) ? normalizedGender : "",
      aadhaar_number: s(parsed.aadhaar_number).replace(/\D/g, "").slice(0, 12),
      address_line1: looksLikeAddress(normalizedAddress1) ? normalizedAddress1 : "",
      address_line2: looksLikeAddress(normalizedAddress2) ? normalizedAddress2 : "",
      landmark: looksLikeAddress(normalizedLandmark) ? normalizedLandmark : "",
      city: looksLikePlace(normalizedCity) ? normalizedCity : "",
      district: looksLikePlace(normalizedDistrict) ? normalizedDistrict : "",
      state: looksLikePlace(normalizedState) ? normalizedState : "",
      pincode: s(parsed.pincode).replace(/\D/g, "").slice(0, 6),
      country: /^india$/i.test(normalizedCountry) || !normalizedCountry ? "India" : "",
      birthplace: looksLikePlace(normalizedBirthplace) ? normalizedBirthplace : "",
    };
  });
