"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// ─── Context ───────────────────────────────────────────────────────────────
type SelectCtx = {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  disabled?: boolean;
};

const SelectContext = React.createContext<SelectCtx | null>(null);

function useSelect() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select compound components must be used within <Select>");
  return ctx;
}

// ─── Root ───────────────────────────────────────────────────────────────────
interface SelectProps {
  value?: string;
  onValueChange?: (v: string) => void;
  defaultValue?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, defaultValue = "", disabled = false, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);

  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;

  const handleChange = React.useCallback(
    (v: string) => {
      if (!controlled) setInternalValue(v);
      onValueChange?.(v);
      setOpen(false);
    },
    [controlled, onValueChange]
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-select-root]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <SelectContext.Provider value={{ value: currentValue, onValueChange: handleChange, open, setOpen, disabled }}>
      <div data-select-root className={cn("relative w-full", open ? "z-[1100]" : "z-0")}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

// ─── Trigger ────────────────────────────────────────────────────────────────
interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children?: React.ReactNode;
}

export function SelectTrigger({ className, children, ...props }: SelectTriggerProps) {
  const { open, setOpen, disabled } = useSelect();
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => !disabled && setOpen(!open)}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
    </button>
  );
}

// ─── Value ──────────────────────────────────────────────────────────────────
interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder, className }: SelectValueProps) {
  const { value } = useSelect();
  return (
    <span className={cn("block truncate", !value && "text-foreground/40", className)}>
      {value || placeholder || "Select..."}
    </span>
  );
}

// ─── Content (dropdown) ─────────────────────────────────────────────────────
interface SelectContentProps {
  className?: string;
  children: React.ReactNode;
}

export function SelectContent({ className, children }: SelectContentProps) {
  const { open } = useSelect();
  if (!open) return null;
  return (
    <div
      className={cn(
        "absolute left-0 top-full z-[1200] mt-1 max-h-72 w-full min-w-[8rem] overflow-auto rounded-md border border-black/10 bg-white text-zinc-950 shadow-2xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-white/10",
        className
      )}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

// ─── Item ───────────────────────────────────────────────────────────────────
interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SelectItem({ value, children, className, disabled }: SelectItemProps) {
  const ctx = useSelect();
  const selected = ctx.value === value;
  return (
    <div
      role="option"
      aria-selected={selected}
      data-disabled={disabled}
      onClick={() => !disabled && ctx.onValueChange(value)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-3 pr-8 text-sm outline-none",
        selected
          ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Label ──────────────────────────────────────────────────────────────────
interface SelectLabelProps {
  className?: string;
  children: React.ReactNode;
}

export function SelectLabel({ className, children }: SelectLabelProps) {
  return (
    <div className={cn("py-1.5 pl-3 pr-2 text-xs font-semibold text-foreground/50 uppercase tracking-wide", className)}>
      {children}
    </div>
  );
}

// ─── Separator ──────────────────────────────────────────────────────────────
export function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-black/10 dark:bg-white/10", className)} />;
}
