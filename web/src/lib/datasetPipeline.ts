/** Normalize dataset metadata from GET /datasets/{id} for UI pipeline state. */

export type DatasetPipelineMeta = {
  status?: string | null;
  cleaned_at?: string | null;
  cleaned_storage_path?: string | null;
  engineered_at?: string | null;
  engineered_storage_path?: string | null;
  engineered_params?: Record<string, unknown> | null;
  quick_trained_at?: string | null;
  has_quick_evaluation?: boolean;
  forecasted_at?: string | null;
  has_forecast?: boolean;
};

export type PipelineDataSource = "engineered" | "cleaned" | "raw";

export function resolvePipelineSource(meta: DatasetPipelineMeta | null | undefined): PipelineDataSource {
  if (!meta) return "raw";
  const st = (meta.status || "").toLowerCase();
  if (
    meta.engineered_at ||
    meta.engineered_storage_path ||
    st === "engineered" ||
    st === "feature_engineered"
  ) {
    return "engineered";
  }
  if (meta.cleaned_at || meta.cleaned_storage_path || st === "cleaned") {
    return "cleaned";
  }
  return "raw";
}

export function hasCleanedDataset(meta: DatasetPipelineMeta | null | undefined): boolean {
  if (!meta) return false;
  return !!(meta.cleaned_at || meta.cleaned_storage_path || meta.status === "cleaned");
}

export function hasEngineeredDataset(meta: DatasetPipelineMeta | null | undefined): boolean {
  if (!meta) return false;
  const st = (meta.status || "").toLowerCase();
  return !!(
    meta.engineered_at ||
    meta.engineered_storage_path ||
    st === "engineered" ||
    st === "feature_engineered"
  );
}

export function hasInstantPreview(meta: DatasetPipelineMeta | null | undefined): boolean {
  if (!meta) return false;
  return !!(meta.quick_trained_at || meta.has_quick_evaluation);
}

export function hasForecast(meta: DatasetPipelineMeta | null | undefined): boolean {
  if (!meta) return false;
  return !!(meta.forecasted_at || meta.has_forecast);
}

export function canExportBundle(meta: DatasetPipelineMeta | null | undefined): boolean {
  return hasCleanedDataset(meta) || hasEngineeredDataset(meta) || hasInstantPreview(meta) || hasForecast(meta);
}
