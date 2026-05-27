"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2, Download, Save, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";
import { apiGetBlob } from "@/lib/apiDownload";
import { hasCleanedDataset, hasEngineeredDataset, type DatasetPipelineMeta } from "@/lib/datasetPipeline";

type GenerativeFeature = {
  name: string;
  formula: string;
  type: string;
  expected_impact: string;
  reason: string;
};

type SuggestResponse = {
  dataset_id: string;
  target_column: string;
  suggested_features: GenerativeFeature[];
};

type ApplyResponse = {
  status: string;
  engineered_at?: string;
  features_added?: number;
};

function featureNamesKey(features: GenerativeFeature[]) {
  return [...features].map((f) => f.name).sort().join("|");
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

export function GenerativeFeatureCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [hasSuggestedOnce, setHasSuggestedOnce] = useState(false);

  const [suggestions, setSuggestions] = useState<GenerativeFeature[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<GenerativeFeature[]>([]);

  const [isFinalized, setIsFinalized] = useState(false);
  const [savedFeatureKey, setSavedFeatureKey] = useState("");
  const [engineeredAt, setEngineeredAt] = useState<string | null>(null);
  const [needsCleaning, setNeedsCleaning] = useState(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!isFinalized) return selectedFeatures.length > 0;
    return featureNamesKey(selectedFeatures) !== savedFeatureKey;
  }, [isFinalized, selectedFeatures, savedFeatureKey]);

  const canDownload = isFinalized && !hasUnsavedChanges && selectedFeatures.length > 0;

  const loadMeta = useCallback(async (): Promise<GenerativeFeature[]> => {
    if (!datasetId) return [];
    setMetaLoading(true);
    try {
      const meta = await apiRequest<
        DatasetPipelineMeta & {
          engineered_params?: { generative_features?: GenerativeFeature[] } | null;
        }
      >(`/datasets/${datasetId}`, { method: "GET" });

      setNeedsCleaning(!(hasCleanedDataset(meta) || hasEngineeredDataset(meta)));
      const saved = meta.engineered_params?.generative_features;
      if (hasEngineeredDataset(meta) && Array.isArray(saved) && saved.length > 0) {
        setSelectedFeatures(saved);
        setSavedFeatureKey(featureNamesKey(saved));
        setIsFinalized(true);
        setEngineeredAt(meta.engineered_at ?? null);
        setHasSuggestedOnce(true);
        return saved;
      }
      setIsFinalized(false);
      setSavedFeatureKey("");
      setEngineeredAt(null);
      return [];
    } catch {
      setIsFinalized(false);
      setNeedsCleaning(false);
      return [];
    } finally {
      setMetaLoading(false);
    }
  }, [datasetId]);

  async function onSuggestFeatures(alreadySelected?: GenerativeFeature[]) {
    if (!datasetId) return;
    if (needsCleaning) {
      toast.message("Clean this dataset before generating features.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<SuggestResponse>(`/datasets/${datasetId}/feature-generation/suggest`, {
        method: "POST",
      });
      const selected = alreadySelected ?? selectedFeatures;
      const currentlySelectedNames = new Set(selected.map((s) => s.name));
      setSuggestions(res.suggested_features.filter((s) => !currentlySelectedNames.has(s.name)));
      setHasSuggestedOnce(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch feature suggestions";
      if (message.toLowerCase().includes("dataset must be cleaned")) {
        setNeedsCleaning(true);
        toast.message("Clean this dataset before generating features.");
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!datasetId) return;
    void loadMeta();
  }, [datasetId, loadMeta]);

  function handleAdd(feature: GenerativeFeature) {
    setSelectedFeatures((prev) => [...prev, feature]);
    setSuggestions((prev) => prev.filter((s) => s.name !== feature.name));
  }

  function handleRemove(feature: GenerativeFeature) {
    setSelectedFeatures((prev) => prev.filter((s) => s.name !== feature.name));
    setSuggestions((prev) => [...prev, feature]);
  }

  async function onSaveSelection() {
    if (!datasetId || selectedFeatures.length === 0) return;
    setSaving(true);
    try {
      const res = await apiRequest<ApplyResponse>(`/datasets/${datasetId}/feature-generation/apply`, {
        method: "POST",
        body: {
          features: selectedFeatures.map((f) => ({
            name: f.name,
            formula: f.formula,
            type: f.type,
          })),
        },
      });
      const key = featureNamesKey(selectedFeatures);
      setSavedFeatureKey(key);
      setIsFinalized(true);
      setEngineeredAt(res.engineered_at ?? new Date().toISOString());
      toast.success(
        `Selection saved (${res.features_added ?? selectedFeatures.length} features). Ready for Train models.`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save features");
    } finally {
      setSaving(false);
    }
  }

  async function onDownloadCsv() {
    if (!datasetId || !canDownload) return;
    setDownloading(true);
    try {
      const { blob } = await apiGetBlob(
        `/datasets/${datasetId}/export/cleaned?format=csv&source=engineered`
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `engineered_${datasetId.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success("Engineered CSV downloaded.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const recommendHref = datasetId
    ? `/dashboard/recommendation?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/recommendation";
  const cleanHref = datasetId
    ? `/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/cleaning";

  return (
    <div className="flex flex-col gap-6">
      {!metaLoading && needsCleaning ? (
        <Card className="border-amber-500/35 bg-amber-500/8">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-lg">Clean dataset first</CardTitle>
                <CardDescription>
                  Clean this dataset before generating features so Acutize can use stable columns, missing-value handling,
                  and your selected target.
                </CardDescription>
              </div>
              <Button asChild className="gap-2 shrink-0">
                <Link href={cleanHref}>
                  Clean dataset
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg">1. Get suggestions</CardTitle>
              <CardDescription>
                Formulas mapped to your cleaned data. Dataset:{" "}
                <DatasetNameDisplay datasetId={datasetId!} />
              </CardDescription>
            </div>
            <Button
              onClick={() => onSuggestFeatures()}
              disabled={loading || !datasetId || needsCleaning}
              className="gap-2 shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Generating…" : hasSuggestedOnce ? "Suggest more features" : "Suggest features"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
              {hasSuggestedOnce
                ? "No new suggestions right now — add from your list below or refresh."
                : "Use Suggest features above to see recommended columns."}
            </p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((feat) => (
                <div
                  key={feat.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{feat.name}</h4>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{feat.type}</span>
                      <span className="text-xs text-blue-700 dark:text-blue-300">
                        Impact: {feat.expected_impact}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{feat.reason}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">Formula: {feat.formula}</p>
                  </div>
                  <Button size="sm" onClick={() => handleAdd(feat)} className="shrink-0 gap-1">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">2. Save your selection</CardTitle>
          <CardDescription>
            Add features from suggestions, save to apply them to your dataset, then download CSV if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metaLoading ? <Skeleton className="h-12 w-full" /> : null}

          {!metaLoading && isFinalized && !hasUnsavedChanges ? (
            <div className="rounded-md border border-emerald-500/35 bg-emerald-500/8 px-4 py-3 text-sm flex gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Selection saved</span>
                {fmtWhen(engineeredAt) ? ` · ${fmtWhen(engineeredAt)}` : ""}. Train models will use this engineered
                version.
              </p>
            </div>
          ) : null}

          {!metaLoading && hasUnsavedChanges && selectedFeatures.length > 0 ? (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/8 px-4 py-3 text-sm flex gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-muted-foreground leading-relaxed">
                {isFinalized
                  ? "You changed your list — save again before downloading."
                  : "Save your list to apply features and unlock download."}
              </p>
            </div>
          ) : null}

          {selectedFeatures.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6 border border-dashed rounded-lg">
              No features selected yet — use Add on a suggestion above.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedFeatures.map((feat) => (
                <div
                  key={feat.name}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-emerald-800 dark:text-emerald-200 truncate">{feat.name}</p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 truncate">{feat.formula}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0"
                    onClick={() => handleRemove(feat)}
                    aria-label={`Remove ${feat.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onSaveSelection}
                disabled={saving || selectedFeatures.length === 0}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save selection"}
              </Button>
              <Button
                variant="outline"
                onClick={onDownloadCsv}
                disabled={!canDownload || downloading}
                className="gap-2"
                title={
                  !isFinalized
                    ? "Save your selection first"
                    : hasUnsavedChanges
                      ? "Save again after changing your list"
                      : "Download engineered CSV"
                }
              >
                <Download className="h-4 w-4" />
                {downloading ? "Downloading…" : "Download CSV"}
              </Button>
            </div>
            <Button
              asChild={isFinalized && !hasUnsavedChanges}
              variant={isFinalized && !hasUnsavedChanges ? "default" : "outline"}
              disabled={!isFinalized || hasUnsavedChanges}
              className="gap-2 shrink-0"
              title={
                !isFinalized
                  ? "Save your feature selection first"
                  : hasUnsavedChanges
                    ? "Save your changes before proceeding"
                    : "Proceed to Model Ideas"
              }
            >
              {isFinalized && !hasUnsavedChanges ? (
                <Link href={recommendHref} className="inline-flex items-center gap-2">
                  Proceed to Model Ideas
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Proceed to Model Ideas
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
