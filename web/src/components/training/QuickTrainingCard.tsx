"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Zap, History, BarChart3, AlertCircle } from "lucide-react";

import { apiRequest } from "@/lib/api";
import {
  type DatasetPipelineMeta,
  resolvePipelineSource,
} from "@/lib/datasetPipeline";
import { ProceedToExportButton } from "@/components/export/ProceedToExportButton";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MetricBlock = Record<string, number>;
type QuickEvaluation = {
  task_type: string;
  target_column: string;
  class_labels: unknown[];
  models: Array<{
    name: string;
    metrics: MetricBlock;
    top_features?: Array<{ feature: string; importance: number }>;
  }>;
  best_model: string;
};

function metricRows(taskType: string) {
  if (taskType === "regression") {
    return [
      ["R² score", "r2"],
      ["MAE", "mae"],
      ["RMSE", "rmse"],
    ] as const;
  }
  return [
    ["Accuracy", "accuracy"],
    ["Precision", "precision"],
    ["Recall", "recall"],
    ["F1 score", "f1"],
  ] as const;
}

function formatMetric(taskType: string, key: string, value: number) {
  if (taskType !== "regression" && ["accuracy", "precision", "recall", "f1"].includes(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(4);
}

function hasMeaningfulMetrics(evaluation: QuickEvaluation) {
  return evaluation.models.some((m) =>
    Object.values(m.metrics ?? {}).some((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

export function QuickTrainingCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [storedTrainedAt, setStoredTrainedAt] = useState<string | null>(null);
  const [hasStoredPreview, setHasStoredPreview] = useState(false);

  const [evaluation, setEvaluation] = useState<QuickEvaluation | null>(null);
  const [previewSource, setPreviewSource] = useState<"none" | "cached" | "fresh">("none");

  const models = useMemo(() => evaluation?.models ?? [], [evaluation]);

  const [showUncleanDialog, setShowUncleanDialog] = useState(false);
  const [targetCol, setTargetCol] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [fetchingCols, setFetchingCols] = useState(false);
  const [trainingSource, setTrainingSource] = useState<"engineered" | "cleaned" | "raw" | null>(null);
  const [engineeredAt, setEngineeredAt] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    (async () => {
      setMetaLoading(true);
      setEvaluation(null);
      setPreviewSource("none");
      try {
        const meta = await apiRequest<DatasetPipelineMeta>(`/datasets/${datasetId}`, { method: "GET" });
        if (!mounted) return;
        setEngineeredAt(meta.engineered_at ?? null);
        setTrainingSource(resolvePipelineSource(meta));

        const res = await apiRequest<{
          quick_trained_at?: string | null;
          quick_evaluation?: QuickEvaluation | null;
        }>(`/datasets/${datasetId}/quick-evaluation`, { method: "GET" });
        if (!mounted) return;
        setStoredTrainedAt(res.quick_trained_at ?? null);
        setHasStoredPreview(!!res.quick_evaluation);
      } catch {
        if (!mounted) return;
        setHasStoredPreview(false);
        setStoredTrainedAt(null);
      } finally {
        if (mounted) setMetaLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  async function loadStoredPreview() {
    if (!datasetId) return;
    setMetaLoading(true);
    try {
      const res = await apiRequest<{
        quick_evaluation: QuickEvaluation | null;
        quick_trained_at?: string | null;
      }>(`/datasets/${datasetId}/quick-evaluation`, { method: "GET" });
      if (!res.quick_evaluation) {
        toast.message("No saved preview found. Run instant preview first.");
        setHasStoredPreview(false);
        return;
      }
      setEvaluation(res.quick_evaluation);
      setPreviewSource("cached");
      setStoredTrainedAt(res.quick_trained_at ?? null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load saved preview");
    } finally {
      setMetaLoading(false);
    }
  }

  async function onTrain() {
    if (!datasetId) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ dataset_id: string; quick_evaluation: QuickEvaluation }>(
        `/datasets/${datasetId}/train-quick`,
        { method: "POST", body: { target_column: targetCol || undefined } }
      );
      setEvaluation(res.quick_evaluation);
      setPreviewSource("fresh");
      setHasStoredPreview(true);
      setStoredTrainedAt(new Date().toISOString());
      const meta = await apiRequest<DatasetPipelineMeta>(`/datasets/${datasetId}`, { method: "GET" });
      setEngineeredAt(meta.engineered_at ?? null);
      setTrainingSource(resolvePipelineSource(meta));
      toast.success("Instant preview complete.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Training failed";
      if (
        message.toLowerCase().includes("specify a target_column") ||
        message.toLowerCase().includes("uncleaned data") ||
        message.toLowerCase().includes("clean the dataset first")
      ) {
        setShowUncleanDialog(true);
        if (!columns.length) fetchCols();
        return;
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCols() {
    if (!datasetId) return;
    setFetchingCols(true);
    try {
      const res = await apiRequest<{ columns?: { column_types?: Array<{ column: string }> } }>(
        `/datasets/${datasetId}/schema`,
        { method: "GET" }
      );
      const types = res.columns?.column_types || [];
      setColumns(types.map((c) => c.column));
    } catch {
      toast.error("Failed to load columns.");
    } finally {
      setFetchingCols(false);
    }
  }

  const showResults = evaluation && previewSource !== "none";
  const metricsLookBroken = evaluation && !hasMeaningfulMetrics(evaluation);
  const compareHref = datasetId
    ? `/dashboard/evaluation?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/evaluation";

  const sourceBanner =
    trainingSource === "engineered" ? (
      <div className="rounded-md border border-emerald-500/35 bg-emerald-500/8 px-4 py-3 text-sm flex gap-3">
        <AlertCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Training uses your feature-engineered dataset</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Instant preview trains on the version with generated features
            {fmtWhen(engineeredAt) ? ` (applied ${fmtWhen(engineeredAt)})` : ""}, not the pre-feature cleaned CSV.
          </p>
        </div>
      </div>
    ) : trainingSource === "cleaned" ? (
      <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm flex gap-3">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Training uses your cleaned dataset</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            No generated features applied yet. Add features on Generate Features to include them in training and export.
          </p>
        </div>
      </div>
    ) : trainingSource === "raw" ? (
      <div className="rounded-md border border-amber-500/35 bg-amber-500/8 px-4 py-3 text-sm flex gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Dataset not cleaned</p>
          <p className="text-muted-foreground mt-1 leading-relaxed">
            Cleaning is recommended before preview. You can still pick a target column and proceed.
          </p>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <Dialog open={showUncleanDialog} onOpenChange={setShowUncleanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dataset not cleaned yet</DialogTitle>
            <DialogDescription>
              Training works best after cleaning. Pick a target column to continue, or clean the data first.
            </DialogDescription>
          </DialogHeader>
          <Select value={targetCol} onValueChange={setTargetCol} disabled={fetchingCols}>
            <SelectTrigger>
              <SelectValue placeholder={fetchingCols ? "Loading columns…" : "Target column"} />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() =>
                (window.location.href = `/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId ?? "")}`)
              }
            >
              Clean data first
            </Button>
            <Button
              disabled={!targetCol || loading}
              onClick={() => {
                setShowUncleanDialog(false);
                onTrain();
              }}
            >
              Proceed anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!metaLoading && sourceBanner}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Run instant preview</CardTitle>
          </div>
          <CardDescription>
            Compare algorithms on a sample. Nothing runs until you click the button below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metaLoading ? <Skeleton className="h-10 w-full" /> : null}

          {!metaLoading && hasStoredPreview && previewSource === "none" ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm bg-muted/30">
              <History className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="space-y-2 min-w-0">
                <p className="text-foreground/90">
                  A previous preview exists{fmtWhen(storedTrainedAt) ? ` (${fmtWhen(storedTrainedAt)})` : ""}.
                </p>
                <Button variant="outline" size="sm" onClick={loadStoredPreview}>
                  View last preview
                </Button>
              </div>
            </div>
          ) : null}

          <Button onClick={onTrain} disabled={loading || !datasetId} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? "Running preview…" : "Run instant preview"}
          </Button>
        </CardContent>
      </Card>

      {showResults ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Preview results</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {previewSource === "cached" ? (
                  <>
                    Saved preview{fmtWhen(storedTrainedAt) ? ` from ${fmtWhen(storedTrainedAt)}` : ""}. Run again to
                    refresh.
                  </>
                ) : (
                  <>
                    Just completed — target:{" "}
                    <span className="font-medium text-foreground">{evaluation!.target_column}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Best model: <span className="font-semibold text-foreground">{evaluation!.best_model}</span>
                {" · "}
                Task: {evaluation!.task_type}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link href={compareHref}>
                  <BarChart3 className="h-4 w-4" />
                  Open model comparison
                </Link>
              </Button>
              <PdfReportButton datasetId={datasetId} label="PDF report" />
              <ProceedToExportButton datasetId={datasetId} />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Want deeper charts, feature importance, and per-model breakdowns? Head to{" "}
            <Link href={compareHref} className="font-medium text-foreground hover:underline">
              Model comparison
            </Link>
            .
          </p>

          {metricsLookBroken ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Metrics look empty — try cleaning your dataset first, then run instant preview again.
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => {
              const isBest = m.name === evaluation!.best_model;
              return (
                <Card key={m.name} className={isBest ? "ring-2 ring-primary/40 border-primary/30" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{m.name}</span>
                      {isBest ? (
                        <span className="text-[10px] uppercase tracking-wide text-primary font-bold shrink-0">
                          Best
                        </span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {metricRows(evaluation!.task_type).map(([label, key]) => (
                      <div key={label} className="flex justify-between text-sm gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">
                          {formatMetric(evaluation!.task_type, key, m.metrics[key] ?? 0)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/10 dark:border-white/10">
            <p className="text-sm text-muted-foreground">
              Download CSVs, full PDF report, and cleaning script in one package.
            </p>
            <ProceedToExportButton datasetId={datasetId} variant="default" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
