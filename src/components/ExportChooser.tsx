import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  EXPORT_REQUEST_EVENT,
  writePdf,
  writeXlsx,
  type ExportRequestPayload,
} from "@/lib/csv-export";

export function ExportChooser() {
  const [payload, setPayload] = useState<ExportRequestPayload | null>(null);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

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

  const run = async (kind: "xlsx" | "pdf") => {
    if (!payload) return;
    setBusy(kind);
    try {
      if (kind === "xlsx") await writeXlsx(payload);
      else await writePdf(payload);
      setPayload(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const rowCount = payload?.rows.length ?? 0;

  return (
    <Dialog open={!!payload} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Choose a format to download
            {payload ? ` (${rowCount} ${rowCount === 1 ? "row" : "rows"})` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left"
            disabled={!!busy}
            onClick={() => run("xlsx")}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {busy === "xlsx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              )}
              Download XLS
            </div>
            <span className="text-xs font-normal text-muted-foreground">
              Excel-compatible spreadsheet
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left"
            disabled={!!busy}
            onClick={() => run("pdf")}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {busy === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 text-red-600" />
              )}
              Download PDF
            </div>
            <span className="text-xs font-normal text-muted-foreground">
              Printable, shareable document
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
