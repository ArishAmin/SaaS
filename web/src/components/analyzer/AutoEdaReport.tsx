"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Bin = { from: number; to: number; count: number };
type Distribution = { column: string; bins: Bin[] };

type EdaResponse = {
  dataset_id: string;
  numeric_columns: string[];
  distributions: Distribution[];
  correlation: { columns: string[]; matrix: number[][] };
  insights: string[];
};

function heatCellStyle(v: number) {
  const a = Math.min(1, Math.abs(v));
  if (v >= 0) return { backgroundColor: `rgba(59,130,246,${a})` }; // blue-500
  return { backgroundColor: `rgba(239,68,68,${a})` }; // red-500
}

export function AutoEdaReport({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [eda, setEda] = useState<EdaResponse | null>(null);

  const columns = useMemo(() => eda?.correlation.columns ?? [], [eda]);
  const matrix = useMemo(() => eda?.correlation.matrix ?? [], [eda]);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await apiRequest<EdaResponse>(`/datasets/${datasetId}/eda`, { method: "POST" });
        if (!mounted) return;
        setEda(res);
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load EDA report";
        toast.error(message);
        setEda(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  if (loading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Auto EDA Report</CardTitle>
          <CardDescription>Building distributions and correlations...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!eda) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto EDA Report</CardTitle>
        <CardDescription>Distributions + correlation heatmap + correlation insights.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {eda.insights?.length ? (
          <div>
            <p className="text-sm font-medium">Text insights</p>
            <div className="mt-2 space-y-2">
              {eda.insights.slice(0, 6).map((t, idx) => (
                <p key={idx} className="text-sm text-foreground/70">
                  {t}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Distributions</p>
            {eda.distributions.slice(0, 4).map((d) => {
              const bins = d.bins;
              const maxCount = Math.max(...bins.map((b) => b.count), 0);
              return (
                <div key={d.column} className="border border-black/10 dark:border-white/10 rounded-lg p-3">
                  <p className="text-sm font-medium truncate">{d.column}</p>
                  <div className="mt-3 flex items-end gap-1 h-24">
                    {bins.slice(0, 20).map((b, i) => {
                      const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
                      return (
                        <div
                          key={i}
                          title={`${d.column}: ${b.from.toFixed(2)} - ${b.to.toFixed(2)} (${b.count})`}
                          className="flex-1 bg-foreground/80 rounded-sm"
                          style={{ height: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {eda.distributions.length === 0 ? (
              <p className="text-sm text-foreground/70">No distributions available (no numeric columns detected).</p>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-medium">Correlation heatmap</p>
            <div
              className="mt-3 overflow-auto border border-black/10 dark:border-white/10 rounded-lg p-2"
              style={{ maxHeight: 340 }}
            >
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${columns.length || 1}, minmax(36px, 1fr))`,
                }}
              >
                {columns.length === 0 ? (
                  <p className="text-sm text-foreground/70 p-2">No correlation matrix available.</p>
                ) : (
                  columns.map((colI, i) =>
                    columns.map((_, j) => {
                      const v = matrix[i]?.[j] ?? 0;
                      const showText = i !== j && Math.abs(v) >= 0.65;
                      return (
                        <div
                          key={`${i}-${j}`}
                          className="h-7 rounded flex items-center justify-center text-[10px] text-foreground/80"
                          style={heatCellStyle(v)}
                        >
                          {showText ? v.toFixed(2) : ""}
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

