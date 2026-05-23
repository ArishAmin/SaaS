"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Context ────────────────────────────────────────────────────────────────
type DialogCtx = { open: boolean; setOpen: (o: boolean) => void };
const DialogContext = React.createContext<DialogCtx>({ open: false, setOpen: () => {} });

// ─── Root ────────────────────────────────────────────────────────────────────
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function Dialog({ open, onOpenChange, defaultOpen = false, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

// ─── Trigger ────────────────────────────────────────────────────────────────
export function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: (e: React.MouseEvent) => {
        (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props?.onClick?.(e as React.MouseEvent<HTMLElement>);
        setOpen(true);
      },
    });
  }
  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}

// ─── Portal / Overlay / Content ─────────────────────────────────────────────
export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = React.useContext(DialogContext);

  // Close on Escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // Lock scroll when dialog is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-6 mx-4",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          className
        )}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

// ─── Header / Footer / Title / Description ─────────────────────────────────
export function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5 mb-4", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 mt-6", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h2 className={cn("text-lg font-semibold leading-tight", className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-sm text-foreground/70 leading-relaxed", className)}>
      {children}
    </p>
  );
}

// ─── Close ──────────────────────────────────────────────────────────────────
export function DialogClose({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { setOpen } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: (e: React.MouseEvent) => {
        (children as React.ReactElement<React.HTMLAttributes<HTMLElement>>).props?.onClick?.(e as React.MouseEvent<HTMLElement>);
        setOpen(false);
      },
    });
  }
  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  );
}
