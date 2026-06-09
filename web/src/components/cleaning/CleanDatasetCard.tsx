"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { apiGetBlob } from "@/lib/apiDownload";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { CleanedDatasetPreview } from "@/components/cleaning/CleanedDatasetPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";

const selectCls = "theme-select flex h-9 w-full rounded-md border border-black/10 px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10";
type CleaningMode = "simple" | "advanced";

type AnalysisResponse = {
  dataset_id: string;
  columns: {
    column_types: Array<{ column: string; type: string }>;
  };
};

type MissingStrategy = "none" | "mean" | "median" | "drop";
type EncodingStrategy = "none" | "label" | "one-hot";
type ScalingStrategy = "none" | "standard" | "min-max";

type DatasetMeta = {
  cleaned_at?: string | null;
  cleaned_storage_path?: string | null;
  cleaned_target_column?: string | null;
  cleaned_params?: {
    missing_strategy?: MissingStrategy;
    encoding?: EncodingStrategy;
    scaling?: ScalingStrategy;
  } | null;
};

function ModeButton({ value, mode, setMode, children }: { value: CleaningMode; mode: CleaningMode; setMode: (m: CleaningMode) => void; children: React.ReactNode }) {
  const active = value === mode;
  return (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`h-9 rounded-md px-4 text-sm font-medium transition-colors ${
        active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export function CleanDatasetCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse["columns"] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  const [cleanedAt, setCleanedAt] = useState<string | null>(null);

  const columns = useMemo(() => analysis?.column_types ?? [], [analysis]);

  const [mode, setMode] = useState<CleaningMode>("simple");
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [missingStrategy, setMissingStrategy] = useState<MissingStrategy>("mean");
  const [encoding, setEncoding] = useState<EncodingStrategy>("none");
  const [scaling, setScaling] = useState<ScalingStrategy>("none");

  useEffect(() => {
    if (!datasetId) return;
    setFetching(true);
    Promise.all([
      apiRequest<AnalysisResponse>(`/datasets/${datasetId}/schema`, { method: "GET" }),
      apiRequest<DatasetMeta>(`/datasets/${datasetId}`, { method: "GET" }).catch(() => null),
    ])
      .then(([res, meta]) => {
        setAnalysis(res.columns);
        setTargetColumn(meta?.cleaned_target_column || res.columns.column_types[0]?.column || "");
        if (meta?.cleaned_storage_path || meta?.cleaned_at) {
          setCleaned(true);
          setCleanedAt(meta.cleaned_at ?? null);
          const params = meta.cleaned_params ?? {};
          setMissingStrategy(params.missing_strategy ?? "mean");
          setEncoding(params.encoding ?? "none");
          setScaling(params.scaling ?? "none");
        } else {
          setCleaned(false);
          setCleanedAt(null);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to fetch dataset analysis";
        toast.error(message);
      })
      .finally(() => setFetching(false));
  }, [datasetId]);

  async function onClean() {
    if (!datasetId) return;
    if (!targetColumn) {
      toast.error("Select a target column first.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(`/datasets/${datasetId}/clean`, {
        method: "POST",
        body:
          mode === "simple"
            ? { mode: "simple", target_column: targetColumn }
            : {
              mode: "advanced",
              target_column: targetColumn,
              missing_strategy: missingStrategy,
              encoding,
              scaling,
            },
      });

      toast.success("Cleaning complete! See your dataset preview below.");
      setCleaned(true);
      setCleanedAt(new Date().toISOString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cleaning failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function onDownloadCleaned() {
    if (!datasetId) return;
    setDownloading(true);
    try {
      const { blob, headers } = await apiGetBlob(`/datasets/${datasetId}/export/cleaned?format=csv`);
      const cd = headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? "cleaned_dataset.csv";
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Cleaned dataset downloaded!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Data Cleaning</CardTitle>
              <CardDescription className="mt-1">
                Choose what to predict (target column) and how to fill gaps, encode categories, and scale numbers. Rows with a
                missing target are removed so models train on valid labels.
              </CardDescription>
            </div>
            <div className="inline-flex rounded-lg border border-black/10 p-1 dark:border-white/10">
              <ModeButton value="simple" mode={mode} setMode={setMode}>Simple</ModeButton>
              <ModeButton value="advanced" mode={mode} setMode={setMode}>Advanced</ModeButton>
            </div>
          </div>
        </CardHeader>
        <CardContent>

          {fetching ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          ) : null}

          {!fetching ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="max-w-xl text-xs leading-relaxed text-foreground/60">
                  {mode === "simple"
                    ? "Simple fills missing values with the mean and leaves encoding and scaling unchanged."
                    : "Advanced lets you choose missing-value handling, category encoding, and scaling before saving the cleaned version."}
                </p>

                <div className="text-sm text-foreground/70">
                  Dataset: <DatasetNameDisplay datasetId={datasetId!} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="target_column">Target column</Label>
                  <select
                    id="target_column"
                    className={selectCls}
                    value={targetColumn}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetColumn(e.target.value)}
                  >
                    {columns.map((c) => (
                      <option key={c.column} value={c.column}>
                        {c.column} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Missing values</Label>
                  {mode === "advanced" ? (
                    <select
                      className={selectCls}
                      value={missingStrategy}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMissingStrategy(e.target.value as MissingStrategy)}
                    >
                      <option value="none">None</option>
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                      <option value="drop">Drop rows</option>
                    </select>
                  ) : (
                    <Input value="Mean (auto)" readOnly />
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>Encoding</Label>
                  {mode === "advanced" ? (
                    <select
                      className={selectCls}
                      value={encoding}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEncoding(e.target.value as EncodingStrategy)}
                    >
                      <option value="none">None</option>
                      <option value="one-hot">One-hot</option>
                      <option value="label">Label</option>
                    </select>
                  ) : (
                    <Input value="None" readOnly />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Scaling</Label>
                  {mode === "advanced" ? (
                    <select
                      className={selectCls}
                      value={scaling}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScaling(e.target.value as ScalingStrategy)}
                    >
                      <option value="none">None</option>
                      <option value="standard">Standard</option>
                      <option value="min-max">Min-max</option>
                    </select>
                  ) : (
                    <Input value="None" readOnly />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={onClean} disabled={loading || !analysis}>
                  {loading ? "Cleaning..." : cleaned ? "Run cleaning again" : "Run cleaning"}
                </Button>
                {cleaned && !loading ? (
                  <p className="text-xs text-foreground/60">Running again will replace the latest cleaned version.</p>
                ) : null}
                {cleaned && (
                  <Button variant="outline" onClick={onDownloadCleaned} disabled={downloading}>
                    {downloading ? "Downloading..." : "Download cleaned CSV"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => (window.location.href = `/dashboard/analyzer?datasetId=${encodeURIComponent(datasetId ?? "")}`)} disabled={!datasetId}>
                  Back to analyzer
                </Button>
                <Button variant="outline" onClick={() => (window.location.href = `/dashboard/business-insights?datasetId=${encodeURIComponent(datasetId ?? "")}`)} disabled={!datasetId}>
                  Go to business insights
                </Button>
                <Button variant="outline" onClick={() => (window.location.href = `/dashboard/forecasting?datasetId=${encodeURIComponent(datasetId ?? "")}`)} disabled={!datasetId}>
                  Go to forecasting
                </Button>
                <PdfReportButton datasetId={datasetId} label="PDF report" sections="analysis,cleaning" />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cleaned && datasetId ? (
        <>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
            Showing the latest cleaned version{cleanedAt ? ` from ${new Date(cleanedAt).toLocaleString()}` : ""}. You can
            download it, generate a report, or run cleaning again with different settings.
          </div>
          <CleanedDatasetPreview datasetId={datasetId} />

          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-black/10 dark:border-white/10">
            <p className="text-sm text-foreground/70">Next: generate business insights, forecast a metric, enrich features, or train models.</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() =>
                  (window.location.href = `/dashboard/business-insights?datasetId=${encodeURIComponent(datasetId)}`)
                }
              >
                Go to Business Insights
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  (window.location.href = `/dashboard/forecasting?datasetId=${encodeURIComponent(datasetId)}`)
                }
              >
                Go to Forecasting
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  (window.location.href = `/dashboard/feature-generation?datasetId=${encodeURIComponent(datasetId)}`)
                }
              >
                Generate Features
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  (window.location.href = `/dashboard/recommendation?datasetId=${encodeURIComponent(datasetId)}`)
                }
              >
                Model Recommendations
              </Button>
              <Button
                onClick={() =>
                  (window.location.href = `/dashboard/training?datasetId=${encodeURIComponent(datasetId)}`)
                }
              >
                Continue to training
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
