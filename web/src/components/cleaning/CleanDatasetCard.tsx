"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { apiGetBlob } from "@/lib/apiDownload";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { CleanedDatasetPreview } from "@/components/cleaning/CleanedDatasetPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StepHint } from "@/components/ui/step-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";

const selectCls = "flex h-9 w-full rounded-md border border-black/10 bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black/20";

type AnalysisResponse = {
  dataset_id: string;
  columns: {
    column_types: Array<{ column: string; type: string }>;
  };
};

export function CleanDatasetCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse["columns"] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [cleaned, setCleaned] = useState(false);

  const columns = useMemo(() => analysis?.column_types ?? [], [analysis]);

  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [missingStrategy, setMissingStrategy] = useState<"mean" | "median" | "drop">("median");
  const [encoding, setEncoding] = useState<"label" | "one-hot">("one-hot");
  const [scaling, setScaling] = useState<"standard" | "min-max">("standard");

  useEffect(() => {
    if (!datasetId) return;
    setFetching(true);
    apiRequest<AnalysisResponse>(`/datasets/${datasetId}/analysis`, { method: "POST", body: { mode: "instant" } })
      .then((res) => {
        setAnalysis(res.columns);
        const firstCol = res.columns.column_types[0]?.column ?? "";
        setTargetColumn(firstCol);
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
          <CardTitle>Data Cleaning</CardTitle>
          <CardDescription>
            Choose what to predict (target column) and how to fill gaps, encode categories, and scale numbers. Rows with a
            missing target are removed so models train on valid labels.
          </CardDescription>
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
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-foreground/70">
                    <Input
                      type="radio"
                      name="clean-mode"
                      checked={mode === "simple"}
                      onChange={() => setMode("simple")}
                    />
                    Simple
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground/70">
                    <Input
                      type="radio"
                      name="clean-mode"
                      checked={mode === "advanced"}
                      onChange={() => setMode("advanced")}
                    />
                    Advanced
                  </label>
                </div>

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
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMissingStrategy(e.target.value as "mean" | "median" | "drop")}
                    >
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                      <option value="drop">Drop rows</option>
                    </select>
                  ) : (
                    <Input value="Median (auto)" readOnly />
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
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEncoding(e.target.value as "label" | "one-hot")}
                    >
                      <option value="one-hot">One-hot</option>
                      <option value="label">Label</option>
                    </select>
                  ) : (
                    <Input value="One-hot (auto)" readOnly />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Scaling</Label>
                  {mode === "advanced" ? (
                    <select
                      className={selectCls}
                      value={scaling}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScaling(e.target.value as "standard" | "min-max")}
                    >
                      <option value="standard">Standard</option>
                      <option value="min-max">Min-max</option>
                    </select>
                  ) : (
                    <Input value="Standard (auto)" readOnly />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={onClean} disabled={loading || !analysis || cleaned}>
                  {loading ? "Cleaning..." : cleaned ? "✓ Cleaned" : "Run cleaning"}
                </Button>
                {cleaned && (
                  <Button variant="outline" onClick={onDownloadCleaned} disabled={downloading}>
                    {downloading ? "Downloading..." : "Download cleaned CSV"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => (window.location.href = `/dashboard/analyzer?datasetId=${encodeURIComponent(datasetId ?? "")}`)} disabled={!datasetId}>
                  Back to analyzer
                </Button>
                <PdfReportButton datasetId={datasetId} label="PDF report" sections="analysis,cleaning" />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cleaned && datasetId ? (
        <>
          <CleanedDatasetPreview datasetId={datasetId} />

          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-black/10 dark:border-white/10">
            <p className="text-sm text-foreground/70">Next: enrich with features or train models.</p>
            <div className="flex gap-2 flex-wrap">
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
