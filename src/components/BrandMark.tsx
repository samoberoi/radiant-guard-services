import logo from "@/assets/radiant-logo.png";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src={logo}
        alt="Radiant Guard Services Pvt. Ltd."
        className="h-10 w-10 shrink-0 object-contain"
      />
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
