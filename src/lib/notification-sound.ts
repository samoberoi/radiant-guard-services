// Lightweight notification chime using WebAudio — no asset needed.
// Respects a per-user mute stored in localStorage.

const MUTE_KEY = "radiant.notifications.muted";

export function isNotificationSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const w = window as WindowWithWebkitAudio;
  const Ctor = window.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Play a soft two-note chime. Silently no-ops if muted or unsupported. */
export function playNotificationChime() {
  if (isNotificationSoundMuted()) return;
  const ac = getCtx();
  if (!ac) return;
  // Some browsers keep the context suspended until a user gesture — resume best-effort.
  if (ac.state === "suspended") {
    void ac.resume().catch(() => undefined);
  }

  const now = ac.currentTime;
  const tones: Array<{ freq: number; start: number; dur: number }> = [
    { freq: 880, start: 0, dur: 0.14 },
    { freq: 1320, start: 0.12, dur: 0.22 },
  ];

  for (const t of tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = t.freq;
    gain.gain.setValueAtTime(0.0001, now + t.start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + t.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.dur + 0.02);
  }
}
