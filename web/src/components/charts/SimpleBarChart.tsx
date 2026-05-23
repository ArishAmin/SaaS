"use client";

type BarItem = {
  label: string;
  value: number;
  hint?: string;
};

function barColor(value: number, max: number) {
  if (max <= 0) return "bg-primary/40";
  const ratio = value / max;
  if (ratio > 0.6) return "bg-amber-500/80 dark:bg-amber-400/70";
  if (ratio > 0.3) return "bg-primary/70";
  return "bg-emerald-500/70 dark:bg-emerald-400/60";
}

export function SimpleBarChart({
  title,
  description,
  items,
  valueSuffix = "",
  maxItems = 12,
}: {
  title: string;
  description?: string;
  items: BarItem[];
  valueSuffix?: string;
  maxItems?: number;
}) {
  const rows = items.slice(0, maxItems);
  const max = Math.max(...rows.map((r) => r.value), 0.0001);

  return (
    <div className="space-y-3">
      {title ? (
        <div>
          <p className="text-sm font-medium">{title}</p>
          {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
        </div>
      ) : null}
      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data to chart.</p>
        ) : (
          rows.map((row) => {
            const width = Math.max(4, Math.round((row.value / max) * 100));
            return (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center text-sm"
              >
                <span className="truncate font-medium" title={row.label}>
                  {row.label}
                </span>
                <div className="h-2.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor(row.value, max)}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap" title={row.hint}>
                  {row.value.toFixed(1)}
                  {valueSuffix}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
