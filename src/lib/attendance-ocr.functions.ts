import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20).max(20_000_000),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(40),
  employees: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        employee_code: z.string().nullable().optional(),
        designation: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
  codes: z
    .array(
      z.object({
        code: z.string(),
        label: z.string(),
      }),
    )
    .min(1)
    .max(40),
});

export type AttendanceOcrRow = {
  candidate_id: string;
  entry_date: string;
  code: string;
  ot_hours: number;
  confident: boolean;
};

export type AttendanceOcrResult = {
  rows: AttendanceOcrRow[];
  unmatched_names: string[];
  notes: string;
};

const SYSTEM_PROMPT = `You are an OCR engine that reads a hand-written or printed monthly attendance / muster-roll sheet from India.
You will be given the exact list of employees (id, name, employee_code, designation) and the exact list of period dates.
Rules:
- Match each visible row on the sheet to one employee in the provided list, by name OR employee_code. Use candidate_id (UUID) in the output, NEVER the name.
- For each (employee, date) cell you can clearly read, emit one row. Skip cells that are blank on the sheet.
- "code" MUST be one of the provided attendance code strings (case-sensitive), or "" if you cannot tell. Map common variants (P=present, A=absent, WO=week off, L=leave, OT marker etc.) only when they exactly match a provided code.
- "ot_hours" is the overtime hours number for that cell, 0 when not applicable. Many sheets list OT on a separate sub-row under each day — attribute it to the same date.
- Set "confident": false when the cell text is ambiguous, smudged, crossed out, partially visible, or you had to guess. Set true only when the cell is clearly legible AND the code is in the allowed list.
- Never invent entries for blank cells. Never output a date that is not in the provided period list.
- Return ONLY a single JSON object with exactly these top-level keys: rows, unmatched_names, notes.
- Do not wrap the JSON in markdown fences or explanatory text.
- Each item in rows must use keys: candidate_id, entry_date, code, ot_hours, confident.
- ot_hours must be a number. confident must be true or false.`;

function stripMarkdownFences(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = stripMarkdownFences(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to balanced-brace extraction.
  }

  for (let start = 0; start < cleaned.length; start++) {
    if (cleaned[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed as Record<string, unknown>;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("OCR returned unreadable JSON");
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[^\d.\-]/g, "");
    return cleaned ? Number(cleaned) : 0;
  }
  return Number(value ?? 0);
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "y";
  }
  return Boolean(value);
}

export const extractAttendanceFromImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AttendanceOcrResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const employeeList = data.employees
      .map(
        (e) =>
          `- ${e.id} | ${e.name}${e.employee_code ? ` | code=${e.employee_code}` : ""}${e.designation ? ` | ${e.designation}` : ""}`,
      )
      .join("\n");
    const codeList = data.codes.map((c) => `${c.code} = ${c.label}`).join(", ");
    const dateList = data.dates.join(", ");

    const promptText = `Allowed attendance codes:\n${codeList}\n\nPeriod dates (only these are valid):\n${dateList}\n\nEmployees (use the UUID as candidate_id):\n${employeeList}\n\nNow read the attached attendance sheet image and return only a JSON object in this shape:\n{"rows":[{"candidate_id":"uuid","entry_date":"YYYY-MM-DD","code":"P","ot_hours":0,"confident":true}],"unmatched_names":[],"notes":"brief note"}`;

    const gateway = createLovableAiGatewayProvider(key);
    // gemini-2.5-flash is multimodal and ~5-10x faster than pro for OCR-style tasks
    const model = gateway("google/gemini-2.5-flash");

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text" as const, text: promptText },
            {
              type: "image" as const,
              image: (() => {
                const m = data.imageDataUrl.match(/^data:[^;]+;base64,(.+)$/);
                if (!m) return new URL(data.imageDataUrl);
                const b64 = m[1];
                const bytes = Uint8Array.from(
                  atob(b64),
                  (c) => c.charCodeAt(0),
                );
                return bytes;
              })(),
            },
          ],
        },
      ],
      temperature: 0,
    });

    const output = extractJsonObject(text);

    const validIds = new Set(data.employees.map((e) => e.id));
    const validDates = new Set(data.dates);
    const validCodes = new Set(data.codes.map((c) => c.code));

    const rows = Array.isArray(output.rows) ? output.rows : [];
    const cleanedRows: AttendanceOcrRow[] = [];
    for (const r of rows) {
      const candidate_id = String(
        (r as { candidate_id?: unknown }).candidate_id ?? "",
      );
      const entry_date = String(
        (r as { entry_date?: unknown }).entry_date ?? "",
      );
      const codeRaw = String((r as { code?: unknown }).code ?? "").trim();
      const ot = toNumber((r as { ot_hours?: unknown }).ot_hours ?? 0);
      const confidentRaw = toBoolean((r as { confident?: unknown }).confident);

      if (!validIds.has(candidate_id) || !validDates.has(entry_date)) continue;
      const codeValid = codeRaw === "" || validCodes.has(codeRaw);
      const code = codeValid ? codeRaw : "";
      const ot_hours = Number.isFinite(ot) ? Math.max(0, Math.min(24, ot)) : 0;
      // If code missing entirely AND no OT, skip (blank cell, not informative)
      if (!code && ot_hours <= 0) continue;
      cleanedRows.push({
        candidate_id,
        entry_date,
        code,
        ot_hours,
        confident: confidentRaw && codeValid && code !== "",
      });
    }

    const unmatched = Array.isArray(output.unmatched_names)
      ? output.unmatched_names.map((n) => String(n)).slice(0, 50)
      : [];

    return {
      rows: cleanedRows,
      unmatched_names: unmatched,
      notes: String(output.notes ?? ""),
    };
  });
