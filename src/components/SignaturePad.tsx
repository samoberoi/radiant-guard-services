import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogDirty } from "@/components/ui/dialog";

/**
 * Lightweight signature pad — uses `signature_pad` dynamically (browser only).
 * Calls onChange with a PNG dataURL whenever the user finishes a stroke.
 */
export function SignaturePad({
  value,
  onChange,
  height = 160,
}: {
  value?: string;
  onChange: (dataUrl: string | "") => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<{
    clear: () => void;
    toDataURL: (t?: string) => string;
    fromDataURL: (u: string) => void;
    isEmpty: () => boolean;
    addEventListener: (e: string, cb: () => void) => void;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const { markDirty, markPristine } = useDialogDirty();

  useEffect(() => {
    let active = true;
    let pad: typeof padRef.current = null;
    let cleanup = () => {};

    void (async () => {
      const mod = await import("signature_pad");
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(ratio, ratio);
      const SignaturePadCtor = mod.default;
      pad = new SignaturePadCtor(canvas, {
        backgroundColor: "rgba(255,255,255,0)",
        penColor: "#1f2937",
        minWidth: 0.8,
        maxWidth: 2.4,
      }) as unknown as typeof padRef.current;
      padRef.current = pad;
      if (value) {
        try {
          pad?.fromDataURL(value);
        } catch {
          /* ignore */
        }
      }
      const syncValue = () => {
        if (!padRef.current) return;
        if (padRef.current.isEmpty()) {
          onChange("");
          markPristine();
        } else {
          onChange(padRef.current.toDataURL("image/png"));
          markDirty();
        }
      };

      const handleStrokeProgress = () => {
        requestAnimationFrame(syncValue);
      };

      pad?.addEventListener("afterUpdateStroke", handleStrokeProgress);
      pad?.addEventListener("endStroke", handleStrokeProgress);
      canvas.addEventListener("pointerup", handleStrokeProgress);
      canvas.addEventListener("mouseup", handleStrokeProgress);
      canvas.addEventListener("touchend", handleStrokeProgress);

      cleanup = () => {
        canvas.removeEventListener("pointerup", handleStrokeProgress);
        canvas.removeEventListener("mouseup", handleStrokeProgress);
        canvas.removeEventListener("touchend", handleStrokeProgress);
      };
      setReady(true);
    })();

    return () => {
      active = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    if (!value) {
      pad.clear();
      return;
    }

    if (pad.isEmpty()) {
      try {
        pad.fromDataURL(value);
      } catch {
        /* ignore */
      }
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-lg border border-dashed border-border bg-secondary/30"
        style={{ height }}
      >
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading signature pad…
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            padRef.current?.clear();
            onChange("");
          }}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
