import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = {
  target?: string;
  title: string;
  body: string;
};

const STORAGE_KEY = "vehicleTourSeen.v1";

const STEPS: Step[] = [
  {
    title: "Welcome to the Vehicles module",
    body: "Quick tour (≈ 1 min) covering the dashboard, alerts and managers. You can re-launch it anytime from the page header.",
  },
  {
    target: '[data-tour="stat-total"]',
    title: "Total Vehicles",
    body: "Click here to jump to Inventory where you add or edit vehicles (with Engine & Chasis numbers that auto-fill into Insurance).",
  },
  {
    target: '[data-tour="stat-service"]',
    title: "Service Due Soon",
    body: "Vehicles within 2,500 km of their next service. Tap to open Service Manager and log a service.",
  },
  {
    target: '[data-tour="stat-ins-expired"]',
    title: "Insurance — Expired",
    body: "Count of policies past their end date. Opens Insurances filtered to expired.",
  },
  {
    target: '[data-tour="stat-ins-renewal"]',
    title: "Insurance — Renewals (≤60d)",
    body: "Policies due in the next 60 days so you can plan renewals ahead of time.",
  },
  {
    target: '[data-tour="stat-puc"]',
    title: "PUC Expiring",
    body: "Pollution certificates expired or expiring soon. Opens PUC Manager filtered to due items.",
  },
  {
    target: '[data-tour="stat-fuel"]',
    title: "Fuel Spend (This Month)",
    body: "Running total of fuel top-ups for the current month. Opens the Expense Manager (Fuel tab).",
  },
  {
    target: '[data-tour="breakdown"]',
    title: "Spend breakdowns",
    body: "See where the money goes — split by fuel type and by payment mode (PetroCard, Cash, UPI, Other).",
  },
  {
    target: '[data-tour="due-lists"]',
    title: "Upcoming Insurance & PUC",
    body: "Sorted by urgency so the most critical renewals are always at the top.",
  },
  {
    title: "You're all set 🎉",
    body: "Use the tabs at the top to jump between Inventory, FastTags, Insurances, PUCs, Service & Expense Managers. Every table now supports column sorting.",
  },
];

type Ctx = { start: () => void };
const TourCtx = createContext<Ctx>({ start: () => {} });
export const useVehicleTour = () => useContext(TourCtx);

export function VehicleTourProvider({ children }: { children: ReactNode }) {
  const [idx, setIdx] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tick, setTick] = useState(0);

  const start = () => setIdx(0);

  // Auto-start for first-time visitors
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = window.setTimeout(() => setIdx(0), 700);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Compute spotlight rect for the current step
  useEffect(() => {
    if (idx === null) return;
    const step = STEPS[idx];
    if (!step.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(step.target!) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      // wait for scroll to settle before measuring
      window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        setRect(r);
      }, 280);
    };
    measure();
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [idx, tick]);

  const close = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setIdx(null);
    setRect(null);
  };

  const onNext = () => {
    if (idx === null) return;
    if (idx >= STEPS.length - 1) close();
    else setIdx(idx + 1);
  };
  const onPrev = () => {
    if (idx === null) return;
    setIdx(Math.max(0, idx - 1));
  };

  const active = idx !== null;
  const step = active ? STEPS[idx!] : null;

  return (
    <TourCtx.Provider value={{ start }}>
      {children}
      {active && step && typeof document !== "undefined"
        ? createPortal(
            <TourOverlay
              step={step}
              rect={rect}
              idx={idx!}
              total={STEPS.length}
              onNext={onNext}
              onPrev={onPrev}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </TourCtx.Provider>
  );
}

function TourOverlay({
  step,
  rect,
  idx,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: Step;
  rect: DOMRect | null;
  idx: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const pad = 8;
  const hasRect = !!rect;

  // Tooltip placement: prefer below the rect, fall back to above, else center
  const tooltipStyle: React.CSSProperties = (() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const W = Math.min(380, vw - 32);
    if (!rect) {
      return {
        top: vh / 2 - 80,
        left: vw / 2 - W / 2,
        width: W,
      };
    }
    const spaceBelow = vh - (rect.bottom + pad);
    const placeBelow = spaceBelow > 220;
    const top = placeBelow ? rect.bottom + pad + 8 : Math.max(16, rect.top - pad - 220);
    let left = rect.left + rect.width / 2 - W / 2;
    left = Math.max(16, Math.min(left, vw - W - 16));
    return { top, left, width: W };
  })();

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Spotlight + dim overlay using box-shadow trick */}
      {hasRect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: rect!.top - pad,
            left: rect!.left - pad,
            width: rect!.width + pad * 2,
            height: rect!.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      )}

      {/* Tooltip card */}
      <div
        className={cn(
          "fixed rounded-2xl border border-border bg-card p-5 shadow-2xl",
          "animate-in fade-in zoom-in-95 duration-200",
        )}
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="font-display text-base font-bold tracking-tight">{step.title}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Step {idx + 1} of {total}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-5 bg-accent" : i < idx ? "w-1.5 bg-accent/60" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={idx === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button size="sm" onClick={onNext}>
              {idx === total - 1 ? "Done" : (<>Next <ChevronRight className="ml-1 h-4 w-4" /></>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
