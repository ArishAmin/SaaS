import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-black/10 bg-white/60 px-3 py-1 text-sm shadow-sm outline-none placeholder:text-foreground/40 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-black/20 dark:border-white/10",
        className
      )}
      {...props}
    />
  );
}

