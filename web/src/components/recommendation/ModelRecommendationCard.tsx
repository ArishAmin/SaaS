"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";

type Suggestion = { name: string; explanation: string };

type RecommendationResponse = {
  dataset_id: string;
  problem_type: "classification" | "regression";
  target_column: string;
  target_unique_count: number;
  target_missing_percent: number;
  suggestions: Suggestion[];
  notes?: string[];
  mvp_notes?: string[];
};

type AnalysisResponse = {
  columns: {
    column_types: Array<{ column: string; type: string }>;
  };
};

type DatasetMeta = {
  cleaned_target_column?: string | null;
};

const selectCls =
  "flex h-9 w-full rounded-md border border-black/10 bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black/20";

export function ModelRecommendationCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [rec, setRec] = useState<RecommendationResponse | null>(null);
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [sampleRows, setSampleRows] = useState<number>(20000);
  const [columns, setColumns] = useState<Array<{ column: string; type: string }>>([]);

  const notes = useMemo(() => rec?.notes ?? rec?.mvp_notes ?? [], [rec]);

  useEffect(() => {
    if (!datasetId) return;
    setRec(null);
    setColumnsLoading(true);

    Promise.all([
      apiRequest<AnalysisResponse>(`/datasets/${datasetId}/analysis`, {
        method: "POST",
        body: { mode: "instant" },
      }).catch(() => null),
      apiRequest<DatasetMeta>(`/datasets/${datasetId}`, { method: "GET" }).catch(() => null),
    ])
      .then(([analysis, meta]) => {
        if (analysis?.columns?.column_types) {
          setColumns(analysis.columns.column_types);
        }
        const cleanedTarget = meta?.cleaned_target_column?.trim();
        if (cleanedTarget) {
          setTargetColumn(cleanedTarget);
        } else if (analysis?.columns?.column_types?.[0]?.column) {
          setTargetColumn(analysis.columns.column_types[0].column);
        }
      })
      .finally(() => setColumnsLoading(false));
  }, [datasetId]);

  async function onRecommend() {
    if (!datasetId) return;
    setLoading(true);
    try {
      const body = {
        target_column: targetColumn.trim() ? targetColumn.trim() : undefined,
        sample_max_rows: sampleRows,
      };
      const res = await apiRequest<RecommendationResponse>(`/datasets/${datasetId}/recommend`, {
        method: "POST",
        body,
      });
      setRec(res);
      setTargetColumn(res.target_column ?? "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Recommendation failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model ideas</CardTitle>
        <CardDescription>
          Heuristic algorithm suggestions for your target — not the same as generative feature columns.
        </CardDescription>
        <p className="text-sm text-muted-foreground pt-1">
          Dataset: <DatasetNameDisplay datasetId={datasetId!} />
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="target-col">Target column</Label>
            {columnsLoading ? (
              <Skeleton className="h-9 w-full mt-1" />
            ) : columns.length > 0 ? (
              <select
                id="target-col"
                className={selectCls + " mt-1"}
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.column} value={c.column}>
                    {c.column} ({c.type})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="target-col"
                className="mt-1"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                placeholder="e.g. price"
              />
            )}
          </div>
          <div>
            <Label htmlFor="sample-rows">Sample rows (max)</Label>
            <Input
              id="sample-rows"
              type="number"
              className="mt-1"
              min={1000}
              max={20000}
              value={sampleRows}
              onChange={(e) => setSampleRows(Number(e.target.value) || 20000)}
            />
          </div>
        </div>

        <Button onClick={onRecommend} disabled={loading || !datasetId}>
          {loading ? "Loading…" : "Get model ideas"}
        </Button>

        {loading && !rec ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {rec ? (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium capitalize">{rec.problem_type}</span> task on{" "}
              <span className="font-mono">{rec.target_column}</span> ({rec.target_unique_count} unique values,{" "}
              {rec.target_missing_percent.toFixed(1)}% missing)
            </p>
            <ul className="space-y-3">
              {rec.suggestions.map((s) => (
                <li key={s.name} className="rounded-lg border p-4">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{s.explanation}</p>
                </li>
              ))}
            </ul>
            {notes.length > 0 ? (
              <div className="text-sm text-muted-foreground border-t pt-3">
                {notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          !loading && (
            <p className="text-sm text-muted-foreground">
              Choose a target and click the button above. Browsing this page does not spend credits.
            </p>
          )
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button
            asChild={!!rec}
            variant={rec ? "default" : "outline"}
            disabled={!rec}
            className="gap-2"
            title={!rec ? "Generate model ideas first" : "Proceed to Train Models"}
          >
            {rec ? (
              <Link
                href={
                  datasetId
                    ? `/dashboard/training?datasetId=${encodeURIComponent(datasetId)}`
                    : "/dashboard/training"
                }
                className="inline-flex items-center gap-2"
              >
                Proceed to Train Models
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2">
                Proceed to Train Models
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
