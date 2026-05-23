import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Short explanation block for workflow steps (what this screen does and what happens next).
 */
export function StepHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-foreground/75 dark:border-white/10 dark:bg-white/[0.04]",
        className
      )}
    >
      {children}
    </div>
  );
}
