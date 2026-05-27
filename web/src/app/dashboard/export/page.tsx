"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Code, FileDown, LayoutGrid, Package, Terminal } from "lucide-react";
import Link from "next/link";

import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { apiGetBlob } from "@/lib/apiDownload";
import { apiRequest } from "@/lib/api";
import {
  type DatasetPipelineMeta,
  canExportBundle,
  hasCleanedDataset,
  hasEngineeredDataset,
  hasInstantPreview,
} from "@/lib/datasetPipeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DatasetMeta = DatasetPipelineMeta & {
  dataset_id: string;
  original_file_name: string;
  status: string;
};

function fmtDate(v?: string | null) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleString();
  } catch {
    return null;
  }
}

function DownloadButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  loading,
  loadingLabel,
  description,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-black/10 dark:border-white/10 hover:bg-foreground/3 transition-colors">
      <div className="mt-0.5 shrink-0 w-9 h-9 rounded-md bg-foreground/8 flex items-center justify-center">
        <Icon className="w-4 h-4 text-foreground/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-foreground/60 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 mt-0.5"
        onClick={onClick}
        disabled={disabled || loading}
      >
        {loading ? loadingLabel ?? "Downloading..." : "Download"}
      </Button>
    </div>
  );
}

function InstructionList({ children }: { children: React.ReactNode }) {
  return <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">{children}</ul>;
}

export default function ExportPage() {
  const params = useSearchParams();
  const datasetId = params.get("datasetId") ?? undefined;
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    async function load() {
      setLoadingMeta(true);
      try {
        const m = await apiRequest<DatasetMeta>(`/datasets/${datasetId}`, { method: "GET" });
        if (!cancelled) setMeta(m);
      } catch {
        if (!cancelled) setMeta(null);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [datasetId]);

  async function dl(
    format: string,
    fallbackName: string,
    source: "latest" | "cleaned" | "engineered" = "latest",
    downloadKey?: string
  ) {
    if (!datasetId) return;
    setDownloading(downloadKey ?? format);
    try {
      const { blob, headers } = await apiGetBlob(
        `/datasets/${datasetId}/export/cleaned?format=${encodeURIComponent(format)}&source=${source}`
      );
      const cd = headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? fallbackName;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded: ${filename}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const hasCleaned = hasCleanedDataset(meta);
  const hasEngineered = hasEngineeredDataset(meta);
  const hasTrained = hasInstantPreview(meta);
  const canBundle = canExportBundle(meta);

  async function downloadBundle() {
    if (!datasetId) return;
    setDownloading("bundle");
    try {
      const { blob, headers } = await apiGetBlob(`/datasets/${datasetId}/export/bundle`);
      const cd = headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `acutize-export-${datasetId.slice(0, 8)}.zip`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Downloaded project bundle");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bundle download failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <NoDatasetGate
        datasetId={datasetId}
        featureName="Export & Reports"
        featureDescription="Download your processed data, Python scripts, PDF report, or a complete ZIP bundle."
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl font-semibold">Export &amp; reports</h2>
            <p className="text-foreground/70 text-sm leading-relaxed">
              Package your work for your team, auditors, or for training on your own machine. Read the instructions on
              each card before downloading.
            </p>
          </div>
          {loadingMeta && <Skeleton className="h-5 w-40" />}
          {meta && (
            <div className="text-xs text-foreground/50 text-right space-y-0.5">
              <p className="font-medium text-foreground/70">{meta.original_file_name}</p>
              {hasCleaned && <p>Cleaned: {fmtDate(meta.cleaned_at)}</p>}
              {hasEngineered && <p>Engineered: {fmtDate(meta.engineered_at)}</p>}
              {hasTrained && <p>Preview: {fmtDate(meta.quick_trained_at)}</p>}
            </div>
          )}
        </div>

        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Download everything (ZIP)
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Single archive with all artifacts. Unzip and open <strong>README.txt</strong> first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">What&apos;s inside the ZIP</p>
              <InstructionList>
                <li>
                  <strong>README.txt</strong> — Step-by-step guide (including how to set your dataset path for training)
                </li>
                <li>
                  <strong>report/acutize-report.pdf</strong> — Full project report for presentations
                </li>
                <li>
                  <strong>data/cleaned.csv</strong> — After cleaning (if you ran Clean &amp; encode)
                </li>
                <li>
                  <strong>data/engineered.csv</strong> — With generated features (if you applied them)
                </li>
                <li>
                  <strong>scripts/train_full_model.py</strong> — Train the winning model locally (after instant preview)
                </li>
                <li>
                  <strong>scripts/cleaning_pipeline.py</strong> — Reproduce cleaning on a new raw file
                </li>
                <li>
                  <strong>scripts/requirements-train.txt</strong> — <code>pip install -r</code> packages
                </li>
              </InstructionList>
            </div>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-4 space-y-2">
              <p className="text-sm font-medium">Full training on your PC (one line to edit)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open <code>scripts/train_full_model.py</code> and set{" "}
                <code>DATA_PATH = r&quot;C:\path\to\your\file.csv&quot;</code>. Use{" "}
                <code>data/engineered.csv</code> or <code>data/cleaned.csv</code> from this ZIP (recommended), or your
                raw file with <code>APPLY_ACUTIZE_CLEANING = True</code>. Then run{" "}
                <code>python scripts/train_full_model.py</code>.
              </p>
            </div>
            <DownloadButton
              label="Project bundle (.zip)"
              icon={Package}
              description="Everything above in one download. Best for handoff or offline work."
              onClick={downloadBundle}
              disabled={loadingMeta || (!canBundle && !!meta)}
              loading={downloading === "bundle"}
              loadingLabel="Building bundle..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Full project report (PDF)
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Printable summary for managers or compliance: pipeline timeline, column profile, cleaning settings, and
              model comparison tables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <InstructionList>
              <li>Does not include raw uploaded data - pair with the ZIP or individual CSV downloads.</li>
              <li>Sections you have not run yet appear as &quot;Not run&quot;.</li>
              <li>For local full training steps, use the ZIP README and <code>train_full_model.py</code>.</li>
            </InstructionList>
            <PdfReportButton datasetId={datasetId} variant="default" label="Download PDF report" />
          </CardContent>
        </Card>

        <Card className={!hasTrained && meta ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Full training script (Python)
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Trains the <strong>best model from your instant preview</strong> on your entire dataset on your machine.
              Requires a completed preview on Train models.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <InstructionList>
              <li>
                Edit only <code>DATA_PATH</code> at the top of the script - path to the tabular file you want to train on.
              </li>
              <li>
                Recommended: <code>data/engineered.csv</code> or <code>data/cleaned.csv</code> from the ZIP (matches
                preview).
              </li>
              <li>
                Raw upload: set <code>APPLY_ACUTIZE_CLEANING = True</code> in the script.
              </li>
              <li>
                Run <code>pip install -r requirements-train.txt</code> then <code>python train_full_model.py</code>.
              </li>
              <li>Output: <code>acutize_model.pkl</code> saved next to the script.</li>
            </InstructionList>
            <DownloadButton
              label="train_full_model.py"
              icon={Terminal}
              description="Standalone script (also included in the ZIP under scripts/)."
              onClick={() => dl("train-full", "train_full_model.py", "latest", "train-full")}
              disabled={!hasTrained}
              loading={downloading === "train-full"}
              loadingLabel="Generating..."
            />
            {!hasTrained && meta ? (
              <p className="text-xs text-muted-foreground">
                <Link
                  href={`/dashboard/training?datasetId=${encodeURIComponent(datasetId ?? "")}`}
                  className="underline font-medium text-foreground"
                >
                  Run instant preview
                </Link>{" "}
                first to unlock this export.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {(hasCleaned || !meta) && (
          <Card className={!hasCleaned && meta ? "opacity-50" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="w-4 h-4" />
                Cleaned dataset
              </CardTitle>
              <CardDescription>
                {hasCleaned
                  ? "Processed table after your cleaning run."
                  : "Run cleaning first to unlock these downloads."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <DownloadButton
                label="Cleaned CSV"
                icon={FileDown}
                description="Use as DATA_PATH in train_full_model.py if you did not apply generated features."
                onClick={() => dl("csv", "cleaned_dataset.csv", "cleaned")}
                disabled={!hasCleaned}
                loading={downloading === "csv"}
                loadingLabel="Downloading CSV..."
              />
              <DownloadButton
                label="Python cleaning script"
                icon={Code}
                description="Re-run imputation, encoding, and scaling on a new raw CSV, JSON, Excel, or Parquet file outside Acutize."
                onClick={() => dl("python-code", "cleaning_pipeline.py")}
                disabled={!hasCleaned}
                loading={downloading === "python-code"}
                loadingLabel="Downloading..."
              />
            </CardContent>
          </Card>
        )}

        {hasEngineered && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="w-4 h-4" />
                Dataset with generated features
              </CardTitle>
              <CardDescription>
                Applied on Generate Features ({fmtDate(meta?.engineered_at)}). Best choice for{" "}
                <code>DATA_PATH</code> when features were added.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DownloadButton
                label="Engineered CSV"
                icon={FileDown}
                description="All cleaned columns plus new generated feature columns."
                onClick={() => dl("csv", "engineered_dataset.csv", "engineered", "engineered-csv")}
                loading={downloading === "engineered-csv"}
                loadingLabel="Downloading..."
              />
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-black/10 dark:border-white/10">
          <LayoutGrid className="w-4 h-4 text-foreground/40 shrink-0" />
          <p className="text-sm text-foreground/60">
            Want to work on a different dataset?{" "}
            <Link href="/dashboard" className="underline font-medium text-foreground">
              Return to the Data Hub
            </Link>
          </p>
        </div>
      </NoDatasetGate>
    </div>
  );
}
