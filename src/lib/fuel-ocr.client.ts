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

type PhotoLabel = "odometer" | "pump" | "receipt" | "filling";

type PhotoInput = {
  label: PhotoLabel;
  file: File;
};

const EMPTY_RESULT: FuelExtraction = {
  fuel_type: "",
  odometer_km: null,
  quantity: null,
  rate: null,
  amount: null,
  location_text: "",
  entry_date: "",
  entry_time: "",
  payment_mode: "",
  notes: "",
};

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[₹]/g, "Rs ")
    .replace(/[|]/g, "1")
    .replace(/[Oo](?=\d)/g, "0")
    .replace(/(?<=\d)[oO]/g, "0")
    .replace(/\s+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

function parseNumber(raw: string | undefined) {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = parseNumber(match?.[1]);
    if (value != null) return value;
  }
  return null;
}

function extractAllNumbers(text: string) {
  return Array.from(text.matchAll(/\b\d{1,6}(?:\.\d{1,3})?\b/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
}

function inferFuelType(text: string) {
  if (/\bcng\b/i.test(text)) return "CNG";
  if (/\bdiesel\b/i.test(text)) return "Diesel";
  if (/\bpetrol\b|\bms\b/i.test(text)) return "Petrol";
  if (/\belectric\b|\bev\b/i.test(text)) return "Electric";
  return "";
}

function inferPaymentMode(text: string) {
  if (/petro\s*card|fleet\s*card|smart\s*fleet/i.test(text)) return "PetroCard";
  if (/\bcash\b/i.test(text)) return "Cash";
  if (/\bupi\b|phonepe|gpay|google\s*pay|paytm/i.test(text)) return "UPI";
  if (/\bcard\b/i.test(text)) return "Other";
  return "";
}

function inferDate(text: string) {
  const match = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (!match) return "";
  let [, dd, mm, yyyy] = match;
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  const day = dd.padStart(2, "0");
  const month = mm.padStart(2, "0");
  return /^\d{4}$/.test(yyyy) ? `${yyyy}-${month}-${day}` : "";
}

function inferTime(text: string) {
  const match = text.match(/\b(\d{1,2}):(\d{2})(?:\s*([AP]M))?\b/i);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23) return "";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function inferLocation(text: string) {
  const lines = text.split(/\n+/).map(cleanLine).filter(Boolean);

  const stationLine = lines.find(
    (line) =>
      /(petrol|pump|station|service|servo|fuel|iocl|indian oil|bharat|bpcl|hp|shell|nayara|essar)/i.test(
        line,
      ) && !/^invoice|receipt|cash memo|tax invoice/i.test(line),
  );

  return stationLine ?? "";
}

function inferOdometer(text: string) {
  const candidates = Array.from(text.matchAll(/\b\d{4,7}\b/g))
    .map((match) => Number(match[0]))
    .filter((value) => value >= 1000 && value <= 9999999)
    .sort((a, b) => b - a);
  return candidates[0] ?? null;
}

function inferFuelNumbers(text: string) {
  let quantity = extractMatch(text, [
    /(?:qty|quantity|volume|vol|litre|litres|liter|liters|units?)\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,3})?)/i,
    /(\d{1,3}(?:\.\d{1,3})?)\s*(?:ltr|litre|litres|liter|liters|kg|units?)\b/i,
  ]);

  let rate = extractMatch(text, [
    /(?:rate|price|unit\s*price|sale\s*price)\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,3})?)/i,
    /rs\.?\s*(\d{1,3}(?:\.\d{1,3})?)\s*(?:\/|per)\s*(?:l|ltr|litre|kg|unit)/i,
  ]);

  let amount = extractMatch(text, [
    /(?:amount|total|sale|net\s*amount)\s*[:\-]?\s*(\d{2,6}(?:\.\d{1,2})?)/i,
    /rs\.?\s*(\d{2,6}(?:\.\d{1,2})?)\b/i,
  ]);

  const allNumbers = extractAllNumbers(text);
  const quantityCandidates = allNumbers.filter(
    (value) => value >= 1 && value <= 150 && !Number.isInteger(value),
  );
  const rateCandidates = allNumbers.filter((value) => value >= 40 && value <= 200);
  const amountCandidates = allNumbers.filter((value) => value >= 50 && value <= 50000);

  quantity ??= quantityCandidates[0] ?? null;
  rate ??= rateCandidates.find((value) => value >= 40 && value <= 200) ?? null;
  amount ??= [...amountCandidates].sort((a, b) => b - a)[0] ?? null;

  if (quantity != null && rate != null && amount == null)
    amount = Number((quantity * rate).toFixed(2));
  if (quantity == null && rate != null && amount != null && rate > 0)
    quantity = Number((amount / rate).toFixed(2));
  if (rate == null && quantity != null && amount != null && quantity > 0)
    rate = Number((amount / quantity).toFixed(2));

  if (quantity != null && (quantity <= 0 || quantity > 150)) quantity = null;
  if (rate != null && (rate < 40 || rate > 200)) rate = null;
  if (amount != null && (amount < 50 || amount > 50000)) amount = null;

  return { quantity, rate, amount };
}

export async function extractFuelFromPhotosLocally(photos: PhotoInput[]): Promise<FuelExtraction> {
  if (photos.length === 0) return EMPTY_RESULT;

  const { recognize } = await import("tesseract.js");

  const recognized = await Promise.all(
    photos.map(async ({ label, file }) => {
      const result = await recognize(file, "eng");
      return {
        label,
        text: normalizeOcrText(result.data.text ?? ""),
      };
    }),
  );

  const byLabel = Object.fromEntries(recognized.map((item) => [item.label, item.text])) as Partial<
    Record<PhotoLabel, string>
  >;
  const fuelText = [byLabel.receipt, byLabel.pump, byLabel.filling].filter(Boolean).join("\n");
  const receiptOrPumpText = [byLabel.receipt, byLabel.pump].filter(Boolean).join("\n");
  const { quantity, rate, amount } = inferFuelNumbers(receiptOrPumpText || fuelText);

  return {
    fuel_type: inferFuelType(fuelText),
    odometer_km: inferOdometer(byLabel.odometer ?? ""),
    quantity,
    rate,
    amount,
    location_text: inferLocation(receiptOrPumpText),
    entry_date: inferDate(receiptOrPumpText),
    entry_time: inferTime(receiptOrPumpText),
    payment_mode: inferPaymentMode(receiptOrPumpText),
    notes: "",
  };
}
