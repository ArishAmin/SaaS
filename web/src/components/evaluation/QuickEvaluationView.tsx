"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProceedToExportButton } from "@/components/export/ProceedToExportButton";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { StepHint } from "@/components/ui/step-hint";

type MetricBlock = Record<string, number>;
type QuickEvaluation = {
  task_type: string;
  target_column: string;
  class_labels: unknown[];
  models: Array<{ name: string; metrics: MetricBlock; top_features?: Array<{ feature: string; importance: number }> }>;
  best_model: string;
};

function metricRows(taskType: string) {
  if (taskType === "regression") {
    return [
      ["R²", "r2"],
      ["MAE", "mae"],
      ["RMSE", "rmse"],
    ] as const;
  }
  return [
    ["Accuracy", "accuracy"],
    ["Precision", "precision"],
    ["Recall", "recall"],
    ["F1", "f1"],
  ] as const;
}

export function QuickEvaluationView({
  datasetId,
  trainHref,
}: {
  datasetId?: string;
  trainHref?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<QuickEvaluation | null>(null);

  const models = useMemo(() => evaluation?.models ?? [], [evaluation]);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{ dataset_id: string; quick_evaluation: QuickEvaluation }>(
          `/datasets/${datasetId}/quick-evaluation`,
          { method: "GET" }
        );
        if (!mounted) return;
        setEvaluation(res.quick_evaluation);
      } catch {
        if (!mounted) return;
        setEvaluation(null);
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
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No preview yet</CardTitle>
          <CardDescription>
            Run an model training on Train models first. Results appear here automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() =>
              (window.location.href =
                trainHref ?? `/dashboard/training?datasetId=${encodeURIComponent(datasetId ?? "")}`)
            }
          >
            Go to train models
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHint>
        These metrics come from your last <strong>model training</strong> on Train models. Classification shows
        accuracy / precision / recall / F1; regression shows R², MAE, and RMSE. Export a PDF or full project bundle from
        the Export page.
      </StepHint>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold">Model comparison</h2>
          <p className="text-sm text-foreground/70 mt-1">
            Best model: <span className="font-medium">{evaluation.best_model}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <PdfReportButton datasetId={datasetId} label="PDF report" size="sm" className="min-w-[8.5rem]" />
          <ProceedToExportButton datasetId={datasetId} className="min-w-[8.5rem]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {metricRows(evaluation.task_type).map(([label, key]) => {
          const values = models.map((m) => m.metrics[key] ?? 0);
          const max = Math.max(...values, 0);
          return (
            <Card key={label} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">{label} comparison</CardTitle>
                <CardDescription>Side-by-side visual comparison</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {models.map((m) => {
                  const v = m.metrics[key] ?? 0;
                  const pct = max > 0 ? (v / max) * 100 : 0;
                  return (
                    <div key={m.name} className="flex items-center gap-3">
                      <p className="w-36 text-xs text-foreground/70 truncate">{m.name}</p>
                      <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.name === evaluation.best_model ? "bg-foreground" : "bg-foreground/60"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="w-16 text-right text-xs text-foreground/70">
                        {v.toFixed(4)}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {models.map((m) => (
          <Card key={m.name} className={m.name === evaluation.best_model ? "border-foreground/30" : undefined}>
            <CardHeader>
              <CardTitle>{m.name}</CardTitle>
              <CardDescription>
                <div className="text-xs max-w-sm mb-1 line-clamp-2">
                  {m.name === "Logistic Regression" ? "Analyzes binary trends using a linear curve." : null}
                  {m.name === "Linear Regression" ? "Predicts continuous numbers using a straight fitted line." : null}
                  {m.name === "Decision Tree" ? "Splits data logically like a flow-chart to find patterns." : null}
                  {m.name === "Random Forest" ? "Builds an army of decision trees and averages them to stop overfitting." : null}
                  {m.name === "Gradient Boosting" ? "Trains trees sequentially, where each fixes the mistakes of the last." : null}
                  {m.name === "XGBoost" ? "State-of-the-art heavy boosting ensemble for max accuracy." : null}
                  {m.name === "Linear SVC" || m.name === "Linear SVR" ? "Finds strict dividing boundaries through hyperspace." : null}
                  {m.name === "Naive Bayes" ? "Fast probabilistic engine assuming features are completely independent." : null}
                  {m.name === "K-Nearest Neighbors" ? "Predicts simply by looking at the most similar historical rows." : null}
                </div>
                {m.name === evaluation.best_model ? <span className="text-foreground/80 font-semibold tracking-tight">Top Performer</span> : "Model comparison"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {metricRows(evaluation.task_type).map(([label, key]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground/70">{label}</span>
                  <span className="text-sm font-medium">{(m.metrics[key] ?? 0).toFixed(4)}</span>
                </div>
              ))}
              {m.top_features?.length ? (
                <div className="pt-3">
                  <p className="text-sm font-medium">Top features</p>
                  <div className="mt-2 space-y-1">
                    {m.top_features.slice(0, 5).map((f) => (
                      <div key={f.feature} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-foreground/70 truncate">{f.feature}</span>
                        <span className="text-xs text-foreground/70">{f.importance.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}

