import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import type { AadhaarExtraction } from "@/lib/aadhaar.functions";

type TesseractModule = typeof import("tesseract.js");

let ocrModulePromise: Promise<TesseractModule> | null = null;

const STATE_NAMES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
] as const;

const EMPTY_EXTRACTION: AadhaarExtraction = {
  full_name: "",
  date_of_birth: "",
  gender: "",
  aadhaar_number: "",
  address_line1: "",
  address_line2: "",
  landmark: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
  country: "India",
  birthplace: "",
};

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).toString();

function loadOcrModule() {
  if (!ocrModulePromise) {
    ocrModulePromise = import("tesseract.js");
  }
  return ocrModulePromise;
}

function cleanLine(value: string) {
  return value
    .replace(/[|]/g, "I")
    .replace(/[•·]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[_=]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(input: string) {
  const value = cleanLine(input);
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slash = value.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

  const yearOnly = value.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;
  return "";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUsefulName(value: string) {
  const next = cleanLine(value);
  return /^[A-Za-z][A-Za-z .'-]{2,79}$/.test(next) && next.split(/\s+/).length >= 2;
}

function isUsefulPlace(value: string) {
  return /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(cleanLine(value));
}

function isUsefulAddress(value: string) {
  const next = cleanLine(value);
  return /[A-Za-z]{3,}/.test(next) && !/[`~^*_={}|<>]{2,}/.test(next);
}

function parseGender(text: string) {
  const match = text.match(/\b(Male|Female|Other)\b/i);
  return match ? titleCase(match[1]) : "";
}

function parseAadhaar(text: string) {
  const compact = text.replace(/[^0-9]/g, "");
  const match = compact.match(/\d{12}/);
  return match?.[0] ?? "";
}

function parseDate(text: string) {
  const dobMatch = text.match(
    /(?:DOB|Date of Birth|Year of Birth|YOB)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4}|\d{4})/i,
  );
  if (dobMatch) return normalizeDate(dobMatch[1]);

  const anyDate = text.match(/\b\d{2}[\/.-]\d{2}[\/.-]\d{4}\b/);
  return anyDate ? normalizeDate(anyDate[0]) : "";
}

function parseName(lines: string[]) {
  const banned =
    /(government of india|unique identification authority|aadhaar|dob|year of birth|male|female|other|address|uidai|downloaded|verify|issued)/i;

  const focusIndex = lines.findIndex((line) => /dob|year of birth|male|female|other/i.test(line));
  const nearby = focusIndex >= 0 ? lines.slice(Math.max(0, focusIndex - 3), focusIndex) : [];
  const pool = [...nearby.reverse(), ...lines];

  const candidate = pool.find((line) => {
    const cleaned = cleanLine(line);
    return isUsefulName(cleaned) && !banned.test(cleaned);
  });

  return candidate ? titleCase(cleanLine(candidate)) : "";
}

function extractAddressLines(lines: string[]) {
  const cleaned = lines.map(cleanLine).filter(Boolean);
  const start = cleaned.findIndex((line) => /\baddress\b/i.test(line));
  const relevant = start >= 0 ? cleaned.slice(start + 1) : cleaned;

  return relevant.filter(
    (line) =>
      !/^(government of india|unique identification authority|aadhaar|uidai|dob|year of birth|male|female|other)$/i.test(line) &&
      !/^\d{4}\s\d{4}\s\d{4}$/.test(line),
  );
}

function splitAddress(lines: string[]) {
  const cleanedLines = extractAddressLines(lines)
    .map((line) => line.replace(/^(Address|Addres|Addr)\s*[:\-]?/i, "").trim())
    .filter(Boolean);

  const joined = cleanedLines.join(", ");
  const pincode = joined.match(/\b\d{6}\b/)?.[0] ?? "";
  const state =
    STATE_NAMES.find((entry) => new RegExp(`\\b${entry.replace(/ /g, "\\s+")}\\b`, "i").test(joined)) ?? "";

  const segments = joined
    .split(",")
    .map((part) => cleanLine(part.replace(/\b\d{6}\b/g, "")))
    .filter(Boolean)
    .filter((part) => !/^(india)$/i.test(part));

  const landmark = segments.find((segment) => /near|opp|opposite|behind|beside|landmark/i.test(segment)) ?? "";
  const nonLandmark = segments.filter((segment) => segment !== landmark);

  const stateIndex = state ? nonLandmark.findIndex((segment) => new RegExp(`^${state}$`, "i").test(segment)) : -1;
  const tail = stateIndex >= 0 ? nonLandmark.slice(0, stateIndex) : nonLandmark;

  const district = tail.length >= 1 ? tail[tail.length - 1] : "";
  const city = tail.length >= 2 ? tail[tail.length - 2] : district;
  const addressParts = tail.slice(0, Math.max(0, tail.length - 2));

  const address1 = addressParts[0] ?? tail[0] ?? "";
  const address2 = addressParts.slice(1).join(", ") || "";

  return {
    address_line1: isUsefulAddress(address1) ? address1 : "",
    address_line2: isUsefulAddress(address2) ? address2 : "",
    landmark: isUsefulAddress(landmark) ? landmark : "",
    city: isUsefulPlace(city) ? titleCase(city) : "",
    district: isUsefulPlace(district) ? titleCase(district) : "",
    state: isUsefulPlace(state) ? titleCase(state) : "",
    pincode,
    country: joined ? "India" : "",
  };
}

function parseText(text: string): AadhaarExtraction {
  const normalized = text.replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const address = splitAddress(lines);

  return {
    ...EMPTY_EXTRACTION,
    full_name: parseName(lines),
    date_of_birth: parseDate(normalized),
    gender: parseGender(normalized),
    aadhaar_number: parseAadhaar(normalized),
    ...address,
  };
}

function textLayerToLines(items: unknown[]) {
  const rows = items
    .map((item) => {
      if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return null;
      const entry = item as { str?: unknown; transform?: unknown };
      const value = cleanLine(String(entry.str ?? ""));
      const transform = Array.isArray(entry.transform) ? entry.transform : [];
      const x = typeof transform[4] === "number" ? transform[4] : 0;
      const y = typeof transform[5] === "number" ? transform[5] : 0;
      return value ? { value, x, y } : null;
    })
    .filter((row): row is { value: string; x: number; y: number } => !!row)
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));

  const grouped: Array<{ y: number; values: Array<{ value: string; x: number }> }> = [];
  for (const row of rows) {
    const bucket = grouped.find((group) => Math.abs(group.y - row.y) < 3);
    if (bucket) {
      bucket.values.push({ value: row.value, x: row.x });
    } else {
      grouped.push({ y: row.y, values: [{ value: row.value, x: row.x }] });
    }
  }

  return grouped
    .map((group) =>
      group.values
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.value)
        .join(" "),
    )
    .map(cleanLine)
    .filter(Boolean);
}

async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pageCount = Math.min(doc.numPages, 2);
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = textLayerToLines(textContent.items as unknown[]);
    if (lines.length) pages.push(lines.join("\n"));
  }

  await doc.destroy();
  return pages.join("\n\n");
}

async function ocrImage(source: string | Blob) {
  const { createWorker } = await loadOcrModule();
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(source);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

async function renderPdfPages(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pageCount = Math.min(doc.numPages, 2);
  const pageImages: Blob[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (blob) pageImages.push(blob);
  }

  await doc.destroy();
  return pageImages;
}

function countValidFields(extraction: AadhaarExtraction) {
  return [
    extraction.aadhaar_number.match(/^\d{12}$/) ? 1 : 0,
    isUsefulName(extraction.full_name) ? 1 : 0,
    isIsoDate(extraction.date_of_birth) ? 1 : 0,
    /^(Male|Female|Other)$/i.test(extraction.gender) ? 1 : 0,
    isUsefulAddress(extraction.address_line1) ? 1 : 0,
    isUsefulAddress(extraction.address_line2) ? 1 : 0,
    isUsefulPlace(extraction.city) ? 1 : 0,
    isUsefulPlace(extraction.district) ? 1 : 0,
    isUsefulPlace(extraction.state) ? 1 : 0,
    /^\d{6}$/.test(extraction.pincode) ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function pickBetterValue(current: string, incoming: string, validator: (value: string) => boolean) {
  const a = cleanLine(current);
  const b = cleanLine(incoming);
  if (validator(b) && !validator(a)) return b;
  if (!validator(b)) return a;
  if (!validator(a)) return b;
  return b.length > a.length ? b : a;
}

export function mergeAadhaarExtractions(...extractions: AadhaarExtraction[]) {
  return extractions.reduce<AadhaarExtraction>((acc, current) => ({
    full_name: pickBetterValue(acc.full_name, current.full_name, isUsefulName),
    date_of_birth: pickBetterValue(acc.date_of_birth, current.date_of_birth, isIsoDate),
    gender: pickBetterValue(acc.gender, current.gender, (value) => /^(Male|Female|Other)$/i.test(value)),
    aadhaar_number: pickBetterValue(acc.aadhaar_number, current.aadhaar_number, (value) => /^\d{12}$/.test(value)),
    address_line1: pickBetterValue(acc.address_line1, current.address_line1, isUsefulAddress),
    address_line2: pickBetterValue(acc.address_line2, current.address_line2, isUsefulAddress),
    landmark: pickBetterValue(acc.landmark, current.landmark, isUsefulAddress),
    city: pickBetterValue(acc.city, current.city, isUsefulPlace),
    district: pickBetterValue(acc.district, current.district, isUsefulPlace),
    state: pickBetterValue(acc.state, current.state, isUsefulPlace),
    pincode: pickBetterValue(acc.pincode, current.pincode, (value) => /^\d{6}$/.test(value)),
    country: current.country || acc.country || "India",
    birthplace: pickBetterValue(acc.birthplace, current.birthplace, isUsefulPlace),
  }), EMPTY_EXTRACTION);
}

export async function extractAadhaarClient(file: File): Promise<AadhaarExtraction> {
  const isPdf = file.type === "application/pdf";

  if (!isPdf) {
    const text = await ocrImage(file);
    return parseText(text);
  }

  const textLayer = await extractPdfText(file);
  const parsedTextLayer = parseText(textLayer);
  if (countValidFields(parsedTextLayer) >= 3) {
    return parsedTextLayer;
  }

  const pageImages = await renderPdfPages(file);
  const pageTexts = await Promise.all(pageImages.map((blob) => ocrImage(blob)));
  const parsedOcr = parseText(pageTexts.join("\n"));

  return mergeAadhaarExtractions(parsedTextLayer, parsedOcr);
}

export function countExtractedFields(extraction: AadhaarExtraction) {
  return countValidFields(extraction);
}

export function hasUsefulAadhaarData(extraction: AadhaarExtraction) {
  const hasIdentityCore = /^\d{12}$/.test(extraction.aadhaar_number) || isUsefulName(extraction.full_name);
  return hasIdentityCore && countValidFields(extraction) >= 3;
}