import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  texts: z.array(z.string()).min(1).max(200),
  target: z.enum(["hi", "mr"]),
});

const LANG_NAME: Record<"hi" | "mr", string> = {
  hi: "Hindi (Devanagari script)",
  mr: "Marathi (Devanagari script)",
};

export const translateBatch = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { texts, target } = data;

    // Build a JSON array prompt for deterministic mapping.
    const prompt = [
      `You are a professional UI localization engine. Translate the following JSON array of short UI strings from English to ${LANG_NAME[target]}.`,
      `Rules:`,
      `- Preserve placeholders, numbers, punctuation, emojis, currency symbols and units exactly.`,
      `- Keep proper nouns, brand names, codes (like EMP-001), and email addresses unchanged.`,
      `- Do NOT translate strings that are already in the target script.`,
      `- Output STRICT JSON: an array of strings, same length and order as input. No prose, no markdown.`,
      ``,
      `Input:`,
      JSON.stringify(texts),
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You translate UI text. Reply with strict JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";

    // Extract JSON array even if model wraps in code fences.
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== texts.length) {
      // Fallback: return originals to avoid breaking UI.
      return { translations: texts };
    }
    return { translations: parsed.map((s) => (typeof s === "string" ? s : "")) };
  });
