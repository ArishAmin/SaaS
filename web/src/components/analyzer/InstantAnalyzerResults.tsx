"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnalysisCharts } from "@/components/analyzer/AnalysisCharts";
import { AutoEdaReport } from "@/components/analyzer/AutoEdaReport";
import { DatasetQualityCard } from "@/components/analyzer/DatasetQualityCard";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";

type ColumnType = { column: string; type: string };
type ColumnMissing = { column: string; missing_percent: number };
type ColumnUnique = { column: string; unique_count: number };
type BasicStatsRow = {
  column: string;
  dtype: string;
  count: number;
  missing_percent: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
};

export type InstantAnalysis = {
  dataset_id: string;
  columns: {
    column_types: ColumnType[];
    missing_values: ColumnMissing[];
    unique_values: ColumnUnique[];
    basic_stats: BasicStatsRow[];
  };
};

type AnalysisLookup = {
  dataset_id: string;
  status?: "not_ready" | "completed";
  analysis?: InstantAnalysis["columns"] | null;
  columns?: InstantAnalysis["columns"] | null;
};

export function InstantAnalyzerResults({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<InstantAnalysis | null>(null);

  const empty = useMemo(() => !datasetId, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiRequest<AnalysisLookup>(`/datasets/${datasetId}/analysis`, {
          method: "POST",
          body: { mode: "instant" },
        });
        if (!mounted) return;
        const columns = data.columns ?? data.analysis ?? null;
        setAnalysis(columns ? { dataset_id: data.dataset_id, columns } : null);
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load analysis";
        if (message.toLowerCase().includes("analysis not ready")) {
          setAnalysis(null);
        } else {
          toast.error(message);
        }
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [datasetId]);

  async function runAnalysis() {
    if (!datasetId) return;
    setRunning(true);
    try {
      const data = await apiRequest<{ dataset_id: string; status: string; analysis: InstantAnalysis["columns"] }>(
        `/datasets/${datasetId}/analyze`,
        { method: "POST", body: { mode: "instant" } }
      );
      setAnalysis({
        dataset_id: data.dataset_id,
        columns: data.analysis,
      });
      toast.success("Analysis complete.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-xl font-semibold">Dataset Analyzer</h2>
          <p className="text-foreground/70 text-sm">
            Reads your uploaded file, profiles every column, and stores results for the rest of
            the pipeline.
          </p>

        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {datasetId ? (
            <>
              <p className="text-sm text-foreground/70 break-all text-right max-w-xs">Dataset: <DatasetNameDisplay datasetId={datasetId} /></p>
              <PdfReportButton datasetId={datasetId} label="PDF report" sections="analysis" />
            </>
          ) : (
            <p className="text-sm text-red-600">Missing datasetId in URL.</p>
          )}
        </div>
      </div>

      {empty ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to analyze</CardTitle>
            <CardDescription>Go upload a dataset first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => (window.location.href = "/dashboard/datasets")}>Go to upload</Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Column types</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Missing values</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && !analysis && !empty ? (
        <Card>
          <CardHeader>
            <CardTitle>Analysis has not been run yet</CardTitle>
            <CardDescription>
              Run analysis when you want the full profile, charts, quality score, and report-ready summary. You can still
              go directly to cleaning, model ideas, or training from the dataset actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={runAnalysis} disabled={running || !datasetId}>
              {running ? "Running analysis..." : "Run analysis"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                (window.location.href = `/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId ?? "")}`)
              }
            >
              Go to cleaning
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {analysis ? (
        <>
          <AnalysisCharts analysis={analysis} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Column types</CardTitle>
                <CardDescription>Detected data types</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.columns.column_types.slice(0, 30).map((c) => (
                  <div key={c.column} className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate">{c.column}</p>
                    <p className="text-xs text-foreground/70">{c.type}</p>
                  </div>
                ))}
                {analysis.columns.column_types.length > 30 ? (
                  <p className="text-xs text-foreground/70">Showing first 30 columns.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Missing values</CardTitle>
                <CardDescription>Missingness percentage by column</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.columns.missing_values
                  .slice()
                  .sort((a, b) => b.missing_percent - a.missing_percent)
                  .slice(0, 30)
                  .map((m) => (
                    <div key={m.column} className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{m.column}</p>
                      <p className="text-xs text-foreground/70">{m.missing_percent.toFixed(2)}%</p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Unique values</CardTitle>
                <CardDescription>Cardinality estimates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {analysis.columns.unique_values
                  .slice()
                  .sort((a, b) => b.unique_count - a.unique_count)
                  .slice(0, 30)
                  .map((u) => (
                    <div key={u.column} className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{u.column}</p>
                      <p className="text-xs text-foreground/70">{u.unique_count}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Basic stats</CardTitle>
                <CardDescription>For numeric columns (mean/std/min/max)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.columns.basic_stats.slice(0, 12).map((s) => (
                  <div key={s.column} className="border border-black/10 dark:border-white/10 rounded-md p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{s.column}</p>
                      <p className="text-xs text-foreground/70">{s.dtype}</p>
                    </div>
                    <p className="text-xs text-foreground/70 mt-1">
                      missing {s.missing_percent.toFixed(2)}% • count {s.count}
                    </p>
                    <div className="mt-2 text-xs text-foreground/70 grid grid-cols-2 gap-y-1">
                      <span>mean: {s.mean?.toFixed(4) ?? "n/a"}</span>
                      <span>std: {s.std?.toFixed(4) ?? "n/a"}</span>
                      <span>min: {s.min?.toFixed(4) ?? "n/a"}</span>
                      <span>max: {s.max?.toFixed(4) ?? "n/a"}</span>
                    </div>
                  </div>
                ))}
                {analysis.columns.basic_stats.length > 12 ? (
                  <p className="text-xs text-foreground/70">Showing first 12 numeric columns.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <AutoEdaReport datasetId={datasetId} />
          <DatasetQualityCard datasetId={datasetId} />

          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-black/10 dark:border-white/10">
            <p className="text-sm text-foreground/70">Next: clean & preprocess your dataset.</p>
            <Button
              onClick={() =>
              (window.location.href = `/dashboard/cleaning?datasetId=${encodeURIComponent(
                datasetId ?? ""
              )}`)
              }
            >
              Clean & preprocess
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
