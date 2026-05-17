import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  fileDataUrl: z.string().min(20).max(20_000_000).optional(),
  fileUrl: z.string().url().optional(),
  mimeType: z.string().min(3).max(100),
  pageImageDataUrls: z.array(z.string().min(20).max(20_000_000)).max(3).optional(),
}).refine((input) => Boolean(input.fileDataUrl || input.fileUrl), {
  message: "Either fileDataUrl or fileUrl is required",
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

function dataUrlToInlinePart(dataUrl: string): { inline_data: { mime_type: string; data: string } } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

async function fileUrlToInlinePart(fileUrl: string, mimeType: string): Promise<{ inline_data: { mime_type: string; data: string } }> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download uploaded Aadhaar file (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  return {
    inline_data: {
      mime_type: mimeType,
      data: Buffer.from(buffer).toString("base64"),
    },
  };
}

export const extractAadhaar = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AadhaarExtraction> => {
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const isPdf = data.mimeType === "application/pdf";
    const pageImages = data.pageImageDataUrls?.filter(Boolean) ?? [];

    const promptText =
      isPdf && pageImages.length
        ? "Extract the Aadhaar fields and the structured address from these Aadhaar page images. Use only what is clearly visible."
        : isPdf
          ? "Extract the Aadhaar fields and the structured address from this Aadhaar PDF. Use only what is clearly visible."
          : "Extract the Aadhaar fields and the structured address from this card image. Use only what is clearly visible.";

    const mediaParts = isPdf && pageImages.length
      ? pageImages.map(dataUrlToInlinePart)
      : [
          data.fileUrl
            ? await fileUrlToInlinePart(data.fileUrl, data.mimeType)
            : dataUrlToInlinePart(data.fileDataUrl!),
        ];

    const parts: Array<Record<string, unknown>> = [{ text: promptText }, ...mediaParts];

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
