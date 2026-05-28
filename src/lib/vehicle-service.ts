// Shared service-due calculations for vehicles.
// Current odometer is dummy/deterministic until real integration lands.

export const DEFAULT_SERVICE_INTERVAL = 5000; // km between services (fallback)
export const ADVANCE_ALERT_KM = 2500; // begin alerting this many km before due

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function dummyCurrentKm(vehicleNumber: string): number {
  const buckets = (89500 - 8000) / 500;
  const idx = hashStr(vehicleNumber) % (buckets + 1);
  return 8000 + idx * 500;
}

export function nextServiceDueKm(currentKm: number, interval: number): number {
  const i = interval > 0 ? interval : DEFAULT_SERVICE_INTERVAL;
  const n = Math.floor(currentKm / i) + 1;
  return n * i;
}

export function serviceStatusFor(vehicleNumber: string, intervalKm?: number | null) {
  const interval = intervalKm && intervalKm > 0 ? intervalKm : DEFAULT_SERVICE_INTERVAL;
  const currentKm = dummyCurrentKm(vehicleNumber);
  const dueKm = nextServiceDueKm(currentKm, interval);
  const kmToService = dueKm - currentKm;
  return {
    currentKm,
    dueKm,
    kmToService,
    interval,
    dueSoon: kmToService <= ADVANCE_ALERT_KM,
  };
}
