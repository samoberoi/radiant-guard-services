import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import type { AadhaarExtraction } from "@/lib/aadhaar.functions";

type TesseractModule = typeof import("tesseract.js");

let ocrModulePromise: Promise<TesseractModule> | null = null;

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

type WorkerWithPort = Worker & { port?: Worker };

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
  return value.replace(/[|]/g, "I").replace(/\s+/g, " ").trim();
}

function normalizeDate(input: string) {
  const value = input.trim();
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

function parseName(lines: string[]) {
  const banned = /(government of india|unique identification authority|aadhaar|dob|year of birth|male|female|address|uidai)/i;
  const candidate = lines.find((line) => {
    const cleaned = cleanLine(line);
    return cleaned.length >= 4 && /^[A-Za-z][A-Za-z .'-]+$/.test(cleaned) && !banned.test(cleaned);
  });
  return candidate ? titleCase(cleanLine(candidate)) : "";
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
  const dobMatch = text.match(/(?:DOB|Date of Birth|Year of Birth|YOB)\s*[:\-]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4}|\d{4})/i);
  if (dobMatch) return normalizeDate(dobMatch[1]);

  const anyDate = text.match(/\b\d{2}[\/.-]\d{2}[\/.-]\d{4}\b/);
  return anyDate ? normalizeDate(anyDate[0]) : "";
}

function splitAddress(lines: string[]) {
  const cleanedLines = lines
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !/^(address|to|c\/o|care of)\b/i.test(line));

  const joined = cleanedLines.join(", ");
  const pincode = joined.match(/\b\d{6}\b/)?.[0] ?? "";
  const stateCandidates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
    "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
  ];
  const state = stateCandidates.find((entry) => new RegExp(`\\b${entry.replace(/ /g, "\\s+")}\\b`, "i").test(joined)) ?? "";

  const segments = joined
    .split(",")
    .map((part) => cleanLine(part.replace(/\b\d{6}\b/g, "")))
    .filter(Boolean);

  const address1 = segments[0] ?? "";
  const address2 = segments[1] ?? "";
  const landmark = segments.find((segment, idx) => idx > 1 && /near|opp|opposite|behind|beside/i.test(segment)) ?? "";
  const trailing = segments.slice(2).filter((segment) => segment !== landmark);
  const city = trailing[trailing.length - 2] ?? segments[2] ?? "";
  const district = trailing[trailing.length - 1] ?? city;

  return {
    address_line1: address1,
    address_line2: address2,
    landmark,
    city,
    district,
    state,
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
  const addressStart = lines.findIndex((line) => /address/i.test(line));
  const addressLines = addressStart >= 0 ? lines.slice(addressStart + 1) : lines.slice(4);
  const address = splitAddress(addressLines);

  return {
    ...EMPTY_EXTRACTION,
    full_name: parseName(lines),
    date_of_birth: parseDate(normalized),
    gender: parseGender(normalized),
    aadhaar_number: parseAadhaar(normalized),
    ...address,
  };
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

export async function extractAadhaarClient(file: File): Promise<AadhaarExtraction> {
  const isPdf = file.type === "application/pdf";

  if (!isPdf) {
    const text = await ocrImage(file);
    return parseText(text);
  }

  const pageImages = await renderPdfPages(file);
  const pageTexts = await Promise.all(pageImages.map((blob) => ocrImage(blob)));
  return parseText(pageTexts.join("\n"));
}

export function countExtractedFields(extraction: AadhaarExtraction) {
  return [
    extraction.full_name,
    extraction.aadhaar_number,
    extraction.date_of_birth,
    extraction.gender,
    extraction.address_line1,
    extraction.address_line2,
    extraction.city,
    extraction.district,
    extraction.state,
    extraction.pincode,
  ].filter((value) => value && value.trim()).length;
}

export function hasUsefulAadhaarData(extraction: AadhaarExtraction) {
  return countExtractedFields(extraction) > 0;
}
