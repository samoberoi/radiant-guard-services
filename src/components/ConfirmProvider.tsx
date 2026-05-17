import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type Ctx = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ctx | null>(null);

let dispatcher: Ctx | null = null;

/** Module-level confirm — works anywhere without hooks. */
export function confirmAction(opts?: ConfirmOptions): Promise<boolean> {
  if (dispatcher) return dispatcher(opts);
  if (typeof window === "undefined") return Promise.resolve(true);
  return Promise.resolve(
    window.confirm(opts?.description ?? opts?.title ?? "Are you sure?"),
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>((o) => {
    setOpts(o ?? {});
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Register/unregister module-level dispatcher.
  if (dispatcher !== confirm) dispatcher = confirm;

  const settle = (v: boolean) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(v);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => !o && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "Confirm action"}</AlertDialogTitle>
            <AlertDialogDescription>
              {opts.description ?? "Are you sure you want to proceed?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                opts.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {opts.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback: native confirm so calls never crash if provider missing.
    return async (o) =>
      typeof window === "undefined"
        ? true
        : window.confirm(o?.description ?? o?.title ?? "Are you sure?");
  }
  return ctx;
}
