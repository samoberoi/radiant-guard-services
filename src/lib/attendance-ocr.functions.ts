import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
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

const OutputSchema = z.object({
  rows: z
    .array(
      z.object({
        candidate_id: z.string().describe("UUID from the employees list"),
        entry_date: z.string().describe("YYYY-MM-DD date"),
        code: z
          .string()
          .describe(
            "One of the allowed attendance codes, or empty string if not readable",
          ),
        ot_hours: z
          .number()
          .min(0)
          .max(24)
          .describe("Overtime hours for that day, 0 if none"),
        confident: z
          .boolean()
          .describe(
            "True only if the cell is clearly legible AND the code is in the allowed list",
          ),
      }),
    )
    .describe("One row per (employee, date) cell you can clearly read"),
  unmatched_names: z
    .array(z.string())
    .describe(
      "Names visible on the sheet that did not match any provided employee",
    ),
  notes: z
    .string()
    .describe("Short free-form note about overall image quality"),
});

const SYSTEM_PROMPT = `You are an OCR engine that reads a hand-written or printed monthly attendance / muster-roll sheet from India.
You will be given the exact list of employees (id, name, employee_code, designation) and the exact list of period dates.
Rules:
- Match each visible row on the sheet to one employee in the provided list, by name OR employee_code. Use candidate_id (UUID) in the output, NEVER the name.
- For each (employee, date) cell you can clearly read, emit one row. Skip cells that are blank on the sheet.
- "code" MUST be one of the provided attendance code strings (case-sensitive), or "" if you cannot tell. Map common variants (P=present, A=absent, WO=week off, L=leave, OT marker etc.) only when they exactly match a provided code.
- "ot_hours" is the overtime hours number for that cell, 0 when not applicable. Many sheets list OT on a separate sub-row under each day — attribute it to the same date.
- Set "confident": false when the cell text is ambiguous, smudged, crossed out, partially visible, or you had to guess. Set true only when the cell is clearly legible AND the code is in the allowed list.
- Never invent entries for blank cells. Never output a date that is not in the provided period list.`;

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

    const promptText = `Allowed attendance codes:\n${codeList}\n\nPeriod dates (only these are valid):\n${dateList}\n\nEmployees (use the UUID as candidate_id):\n${employeeList}\n\nNow read the attached attendance sheet image and produce the JSON.`;

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-pro");

    const { output } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text" as const, text: promptText },
            {
              type: "image_url" as const,
              image_url: { url: data.imageDataUrl },
            },
          ],
        },
      ],
      output: Output.object({ schema: OutputSchema }),
      temperature: 0,
    });

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
      const ot = Number((r as { ot_hours?: unknown }).ot_hours ?? 0);
      const confidentRaw = Boolean(
        (r as { confident?: unknown }).confident,
      );

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
