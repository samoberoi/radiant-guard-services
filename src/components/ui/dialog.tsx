"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/ConfirmProvider";

const DialogPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function useDialogPortalContainer() {
  return React.useContext(DialogPortalContainerContext);
}

// ---- Dirty-guard plumbing -----------------------------------------------
// Tracks whether the user has typed/interacted inside an open dialog. If so,
// any close attempt (Cancel button, ✕, outside click, Escape) is intercepted
// and a "Discard unsaved changes?" confirmation is shown first.
type DirtyCtx = {
  dirtyRef: React.MutableRefObject<boolean>;
  reset: () => void;
  disabled: boolean;
};
const DialogDirtyContext = React.createContext<DirtyCtx | null>(null);

/** Opt out of the global unsaved-changes guard for a specific Dialog. */
export const DialogDirtyGuardOff = ({ children }: { children: React.ReactNode }) => {
  const dirtyRef = React.useRef(false);
  return (
    <DialogDirtyContext.Provider
      value={{ dirtyRef, reset: () => {}, disabled: true }}
    >
      {children}
    </DialogDirtyContext.Provider>
  );
};

type DialogRootProps = React.ComponentProps<typeof DialogPrimitive.Root>;

const Dialog = ({ onOpenChange, open, defaultOpen, children, ...props }: DialogRootProps) => {
  const dirtyRef = React.useRef(false);
  const ctxRef = React.useRef<DirtyCtx>({
    dirtyRef,
    reset: () => {
      dirtyRef.current = false;
    },
    disabled: false,
  });

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        dirtyRef.current = false;
        onOpenChange?.(true);
        return;
      }
      if (!dirtyRef.current || ctxRef.current.disabled) {
        onOpenChange?.(false);
        return;
      }
      void confirmAction({
        title: "Discard unsaved changes?",
        description: "Any information you've entered will be lost.",
        confirmText: "Discard",
        cancelText: "Keep editing",
        destructive: true,
      }).then((ok) => {
        if (ok) {
          dirtyRef.current = false;
          onOpenChange?.(false);
        }
      });
    },
    [onOpenChange],
  );

  return (
    <DialogDirtyContext.Provider value={ctxRef.current}>
      <DialogPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogDirtyContext.Provider>
  );
};

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [contentElement, setContentElement] = React.useState<HTMLElement | null>(null);
  const dirtyCtx = React.useContext(DialogDirtyContext);

  const handleRef = React.useCallback(
    (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      setContentElement(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  // Mark the dialog dirty on any field interaction, and pristine when a
  // save-intent button is clicked or a form is submitted (so successful
  // saves close silently; failed saves re-dirty as the user resumes typing).
  React.useEffect(() => {
    if (!contentElement || !dirtyCtx || dirtyCtx.disabled) return;
    dirtyCtx.reset();
    const markDirty = () => {
      dirtyCtx.dirtyRef.current = true;
    };
    const SAVE_RX = /^(save|update|create|add|submit|confirm|apply|generate|send|approve|sign|upload|import|export|next|continue|finish|done)\b/i;
    const onClick = (e: Event) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(
        "button",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const txt = (btn.textContent || "").trim();
      if (btn.type === "submit" || SAVE_RX.test(txt)) {
        dirtyCtx.reset();
      }
    };
    const onSubmit = () => dirtyCtx.reset();
    contentElement.addEventListener("input", markDirty, true);
    contentElement.addEventListener("change", markDirty, true);
    contentElement.addEventListener("click", onClick, true);
    contentElement.addEventListener("submit", onSubmit, true);
    return () => {
      contentElement.removeEventListener("input", markDirty, true);
      contentElement.removeEventListener("change", markDirty, true);
      contentElement.removeEventListener("click", onClick, true);
      contentElement.removeEventListener("submit", onSubmit, true);
    };
  }, [contentElement, dirtyCtx]);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPortalContainerContext.Provider value={contentElement}>
        <DialogPrimitive.Content
          ref={handleRef}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-white/40 dark:border-white/10 bg-white/75 dark:bg-background/70 backdrop-blur-2xl backdrop-saturate-150 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-2xl",
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortalContainerContext.Provider>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

/**
 * Imperatively mark the nearest enclosing Dialog as pristine — call after a
 * successful save so the close that follows won't trigger the discard prompt.
 */
export function useDialogDirty() {
  const ctx = React.useContext(DialogDirtyContext);
  return React.useMemo(
    () => ({
      markPristine: () => ctx?.reset(),
      markDirty: () => {
        if (ctx) ctx.dirtyRef.current = true;
      },
    }),
    [ctx],
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
