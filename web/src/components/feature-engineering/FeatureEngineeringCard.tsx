"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import { Download } from "lucide-react";

import { apiRequest } from "@/lib/api";
import { apiGetBlob } from "@/lib/apiDownload";
import {
  hasCleanedDataset,
  hasEngineeredDataset,
  type DatasetPipelineMeta,
} from "@/lib/datasetPipeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type FeatureImportanceRow = { feature: string; importance: number };
type FeatureEngineerResponse = {
  dataset_id: string;
  target_column: string;
  keep_features: string[];
  dropped_features: string[];
  feature_importance: FeatureImportanceRow[];
  max_importance: number;
  applied: boolean;
  engineered_storage_path?: string;
};

export function FeatureEngineeringCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pipelineMeta, setPipelineMeta] = useState<DatasetPipelineMeta | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FeatureEngineerResponse | null>(null);

  const [topK, setTopK] = useState<number>(20);
  const [threshold, setThreshold] = useState<number | null>(null);

  const top10 = useMemo(() => {
    const rows = suggestions?.feature_importance ?? [];
    return rows.slice(0, 10);
  }, [suggestions]);

  useEffect(() => {
    if (!datasetId) return;
    apiRequest<DatasetPipelineMeta>(`/datasets/${datasetId}`, { method: "GET" })
      .then(setPipelineMeta)
      .catch(() => setPipelineMeta(null));
  }, [datasetId]);

  async function onDownloadDataset() {
    if (!datasetId) return;
    setDownloading(true);
    try {
      const source = hasEngineeredDataset(pipelineMeta) ? "engineered" : "cleaned";
      const { blob } = await apiGetBlob(
        `/datasets/${datasetId}/export/cleaned?format=csv&source=${source}`
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = source === "engineered" ? "engineered_dataset.csv" : "cleaned_dataset.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Dataset downloaded.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function onRefreshSuggestions() {
    if (!datasetId) return;
    setSuggestionsLoading(true);
    setSuggestions(null);

    try {
      const res = await apiRequest<FeatureEngineerResponse>(`/datasets/${datasetId}/feature-engineer`, {
        method: "POST",
        body: { top_k: topK, importance_threshold: threshold, dry_run: true },
      });
      setSuggestions(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch suggestions";
      toast.error(message);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function onApply() {
    if (!datasetId) return;
    if (threshold !== null && topK === 0) {
      toast.error("Pick either top_k or threshold.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<FeatureEngineerResponse>(`/datasets/${datasetId}/feature-engineer`, {
        method: "POST",
        body: { top_k: topK, importance_threshold: threshold, dry_run: false },
      });
      setPipelineMeta({
        engineered_at: new Date().toISOString(),
        engineered_storage_path: res.engineered_storage_path,
        status: "feature_engineered",
      });
      toast.success("Feature selection applied. Training will use engineered features.");
      window.location.href = `/dashboard/training?datasetId=${encodeURIComponent(datasetId)}`;
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to apply feature engineering";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Engineering</CardTitle>
        <CardDescription>
          Rank features with a decision tree and keep the strongest columns for training.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!suggestions && !suggestionsLoading ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p className="mb-4">
              Preview which columns matter most. Applying your selection saves an engineered dataset.
            </p>
            <Button onClick={onRefreshSuggestions} disabled={suggestionsLoading}>
              {suggestionsLoading ? "Loading…" : "Preview feature importance"}
            </Button>
          </div>
        ) : null}

        {suggestionsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : null}

        {suggestions && !suggestionsLoading ? (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-foreground/70">Target: <span className="font-medium">{suggestions.target_column}</span></p>
                <p className="text-sm text-foreground/70 mt-1">Keep: <span className="font-medium">{suggestions.keep_features.length}</span> • Drop: <span className="font-medium">{suggestions.dropped_features.length}</span></p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => (window.location.href = `/dashboard/training?datasetId=${encodeURIComponent(datasetId ?? "")}`)}>
                  Back to training
                </Button>
                <Button
                  variant="outline"
                  onClick={onDownloadDataset}
                  disabled={
                    downloading ||
                    (!hasEngineeredDataset(pipelineMeta) && !hasCleanedDataset(pipelineMeta))
                  }
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? "Downloading…" : "Download dataset"}
                </Button>
                <Button variant="outline" onClick={onRefreshSuggestions} disabled={suggestionsLoading}>
                  {suggestionsLoading ? "Updating…" : "Refresh preview"}
                </Button>
                <Button onClick={onApply} disabled={loading}>
                  {loading ? "Applying…" : "Apply selection"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="top_k">Top K features</Label>
                <Input
                  id="top_k"
                  type="number"
                  value={topK}
                  onChange={(e) => setTopK(Math.max(0, Number(e.target.value)))}
                  min={0}
                />
                <p className="text-xs text-foreground/70">
                  If set, the backend keeps the top features by importance.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="threshold">Importance threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  value={threshold ?? ""}
                  placeholder="e.g. 0.005"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) setThreshold(null);
                    else setThreshold(Number(v));
                  }}
                />
                <p className="text-xs text-foreground/70">
                  Optional: override selection using importance greater than or equal to threshold.
                </p>
              </div>
            </div>

            <div className="border border-black/10 dark:border-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium">Top feature importance</p>
                <p className="text-xs text-foreground/70">Scaled to max importance</p>
              </div>

              <div className="mt-3 space-y-2">
                {top10.map((r) => {
                  const pct = suggestions.max_importance > 0 ? (r.importance / suggestions.max_importance) * 100 : 0;
                  return (
                    <div key={r.feature} className="flex items-center gap-3">
                      <div className="w-2/5 min-w-[150px]">
                        <p className="text-xs text-foreground/70 truncate">{r.feature}</p>
                      </div>
                      <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right">
                        <p className="text-xs text-foreground/70">{r.importance.toFixed(4)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

