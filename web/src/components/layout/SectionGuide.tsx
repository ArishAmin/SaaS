import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";
import { cn } from "@/lib/utils";

type Step = { title: string; detail: string };

export function SectionGuide({
  title,
  subtitle,
  datasetId,
  steps,
  next,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  datasetId?: string;
  steps?: Step[];
  next?: { label: string; href: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
        {datasetId ? (
          <p className="text-xs text-muted-foreground">
            Dataset: <DatasetNameDisplay datasetId={datasetId} />
          </p>
        ) : null}
      </div>

      {steps && steps.length > 0 ? (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-lg border border-black/10 dark:border-white/10 bg-foreground/[0.02] p-3 space-y-1"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step {i + 1}
              </p>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {children}

      {next ? (
        <div className="flex items-center gap-2 text-sm pt-1 border-t border-black/10 dark:border-white/10">
          <span className="text-muted-foreground">Next:</span>
          <Link href={next.href} className="font-medium inline-flex items-center gap-1 hover:underline">
            {next.label}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
