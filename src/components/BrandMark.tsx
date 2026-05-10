import { ShieldCheck } from "lucide-react";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
        <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={2.4} />
      </div>
      <div className="leading-tight">
        <div className="font-display text-base font-bold tracking-tight text-foreground">
          Radiant Guard
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Services Pvt. Ltd.
        </div>
      </div>
    </div>
  );
}
