import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, BarChart3, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  EXPORT_REQUEST_EVENT,
  writePdf,
  writeXlsx,
  type ExportRequestPayload,
} from "@/lib/csv-export";

type OptionKind = "xlsx" | "pdf" | "mis";

export function ExportChooser() {
  const [payload, setPayload] = useState<ExportRequestPayload | null>(null);
  const [busy, setBusy] = useState<OptionKind | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __lovableExportChooserMounted?: boolean };
    w.__lovableExportChooserMounted = true;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ExportRequestPayload>).detail;
      if (!detail) return;
      setPayload(detail);
    };
    window.addEventListener(EXPORT_REQUEST_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(EXPORT_REQUEST_EVENT, handler as EventListener);
      w.__lovableExportChooserMounted = false;
    };
  }, []);

  const close = () => {
    if (busy) return;
    setPayload(null);
  };

  const run = async (kind: OptionKind) => {
    if (!payload) return;
    setBusy(kind);
    try {
      if (kind === "xlsx") {
        await writeXlsx(payload);
      } else if (kind === "pdf") {
        await writePdf(payload);
      } else if (kind === "mis" && payload.mis) {
        await writeXlsx({
          filename: payload.mis.filename,
          rows: payload.mis.rows,
          columns: payload.mis.columns,
        });
      }
      setPayload(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const rowCount = payload?.rows.length ?? 0;
  const hasMis = !!payload?.mis;

  const options: {
    kind: OptionKind;
    title: string;
    desc: string;
    icon: typeof FileSpreadsheet;
    iconWrap: string;
    hover: string;
  }[] = payload
    ? [
        {
          kind: "xlsx",
          title: payload.labels?.xlsx?.title ?? "Download XLS",
          desc: payload.labels?.xlsx?.desc ?? "Excel-compatible spreadsheet",
          icon: FileSpreadsheet,
          iconWrap: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
          hover: "hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100/50",
        },
        {
          kind: "pdf",
          title: payload.labels?.pdf?.title ?? "Download PDF",
          desc: payload.labels?.pdf?.desc ?? "Printable, shareable document",
          icon: FileText,
          iconWrap: "bg-red-50 text-red-600 ring-1 ring-red-100",
          hover: "hover:border-red-300 hover:shadow-md hover:shadow-red-100/50",
        },
        ...(hasMis
          ? [
              {
                kind: "mis" as const,
                title: payload.mis?.title ?? "Download MIS",
                desc: payload.mis?.desc ?? "Management summary spreadsheet",
                icon: BarChart3,
                iconWrap: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100",
                hover: "hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50",
              },
            ]
          : []),
      ]
    : [];

  return (
    <Dialog open={!!payload} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-b from-muted/40 to-transparent">
          <DialogTitle className="text-xl font-semibold tracking-tight">Export data</DialogTitle>
          <DialogDescription className="text-sm">
            Choose a format to download
            {payload ? ` · ${rowCount} ${rowCount === 1 ? "row" : "rows"}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className={`grid gap-3 p-6 ${hasMis ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {options.map((opt) => {
            const Icon = opt.icon;
            const isBusy = busy === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                disabled={!!busy}
                onClick={() => run(opt.kind)}
                className={`group relative flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all disabled:opacity-60 disabled:pointer-events-none ${opt.hover}`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${opt.iconWrap}`}>
                  {isBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">{opt.title}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
