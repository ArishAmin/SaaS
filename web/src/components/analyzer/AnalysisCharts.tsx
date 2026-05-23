"use client";

import { useMemo } from "react";
import { BarChart3, Layers, AlertTriangle, Hash } from "lucide-react";

import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InstantAnalysis } from "@/components/analyzer/InstantAnalyzerResults";

function typeLabel(type: string) {
  const t = type.toLowerCase();
  if (t.includes("int") || t.includes("float") || t === "numeric") return "Number";
  if (t.includes("date") || t.includes("time")) return "Date/time";
  if (t.includes("bool")) return "Yes/no";
  if (t.includes("cat") || t.includes("object") || t.includes("str")) return "Category";
  return type;
}

export function AnalysisCharts({ analysis }: { analysis: InstantAnalysis }) {
  const cols = analysis.columns;

  const missingBars = useMemo(
    () =>
      [...cols.missing_values]
        .sort((a, b) => b.missing_percent - a.missing_percent)
        .slice(0, 12)
        .map((m) => ({
          label: m.column,
          value: m.missing_percent,
          hint: `${m.missing_percent.toFixed(1)}% empty cells`,
        })),
    [cols.missing_values]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cols.column_types) {
      const label = typeLabel(c.type);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [cols.column_types]);

  const cardinalityBars = useMemo(
    () =>
      [...cols.unique_values]
        .sort((a, b) => b.unique_count - a.unique_count)
        .slice(0, 10)
        .map((u) => ({
          label: u.column,
          value: u.unique_count,
          hint: `${u.unique_count} distinct values`,
        })),
    [cols.unique_values]
  );

  const highMissing = missingBars.filter((m) => m.value >= 20).length;
  const numericCount = cols.basic_stats.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={Layers}
          label="Columns profiled"
          value={String(cols.column_types.length)}
          hint="Every column was scanned for type and quality."
        />
        <SummaryTile
          icon={BarChart3}
          label="Numeric columns"
          value={String(numericCount)}
          hint="Columns where mean, spread, and range were calculated."
        />
        <SummaryTile
          icon={AlertTriangle}
          label="High missingness"
          value={String(highMissing)}
          hint="Columns with 20%+ missing values — may need cleaning."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Missing data by column</CardTitle>
            <CardDescription>
              Taller bars mean more empty cells. Aim to fix or drop columns above ~20% before training.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart items={missingBars} title="" valueSuffix="%" maxItems={12} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Column types at a glance</CardTitle>
            <CardDescription>How your dataset splits into numbers, categories, and other types.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart items={typeCounts} title="" valueSuffix=" cols" maxItems={8} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Cardinality (unique values)
            </CardTitle>
            <CardDescription>
              High cardinality on a category column can mean many one-hot columns after encoding — watch memory on
              large files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart items={cardinalityBars} title="" maxItems={10} />
          </CardContent>
        </Card>
      </div>

      {numericCount > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Numeric ranges</CardTitle>
            <CardDescription>Min → max span for each numeric column (quick sanity check for outliers).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cols.basic_stats.slice(0, 9).map((s) => {
              const span = (s.max ?? 0) - (s.min ?? 0);
              const safeSpan = Math.abs(span) < 1e-9 ? 1 : Math.abs(span);
              const meanPos =
                s.mean !== undefined && s.min !== undefined
                  ? Math.min(100, Math.max(0, ((s.mean - (s.min ?? 0)) / safeSpan) * 100))
                  : 50;
              return (
                <div
                  key={s.column}
                  className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2"
                >
                  <p className="text-sm font-medium truncate">{s.column}</p>
                  <div className="relative h-2 rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary shadow"
                      style={{ left: `calc(${meanPos}% - 6px)` }}
                      title={`Mean ≈ ${s.mean?.toFixed(2) ?? "n/a"}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>min {s.min?.toFixed(2) ?? "—"}</span>
                    <span>mean {s.mean?.toFixed(2) ?? "—"}</span>
                    <span>max {s.max?.toFixed(2) ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-foreground/[0.02] p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{hint}</p>
    </div>
  );
}

