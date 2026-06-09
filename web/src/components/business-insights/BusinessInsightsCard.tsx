"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Lightbulb, PieChart, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { apiRequest } from "@/lib/api";

type Mode = "simple" | "advanced";

type BusinessChart = {
  title: string;
  description: string;
  type: "bar";
  value_suffix?: string;
  items: Array<{ label: string; value: number; hint?: string }>;
};

type BusinessInsight = {
  title: string;
  summary: string;
  reasoning: string;
};

type BusinessInsightsResult = {
  dataset_id: string;
  source: string;
  generated_at: string;
  row_count: number;
  column_count: number;
  numeric_columns: number;
  category_columns: number;
  date_columns: number;
  missing_cells_percent: number;
  duplicate_rows: number;
  charts: BusinessChart[];
  insights: BusinessInsight[];
  warnings: string[];
};

type BusinessInsightsSchema = {
  dataset_id: string;
  source: string;
  analysis_ready: boolean;
  analyzed_at?: string | null;
  row_count: number;
  columns: Array<{ name: string }>;
  saved_business_insights?: BusinessInsightsResult | null;
  business_insights_at?: string | null;
};

function ModeButton({ value, mode, setMode, children }: { value: Mode; mode: Mode; setMode: (m: Mode) => void; children: React.ReactNode }) {
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

function fmtDate(v?: string | null) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function MetricTile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-foreground/[0.02] p-4 dark:border-white/10">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/60">{hint}</p>
    </div>
  );
}

export function BusinessInsightsCard({ datasetId }: { datasetId?: string }) {
  const [mode, setMode] = useState<Mode>("simple");
  const [source, setSource] = useState("latest");
  const [schema, setSchema] = useState<BusinessInsightsSchema | null>(null);
  const [result, setResult] = useState<BusinessInsightsResult | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    async function load() {
      setLoadingSchema(true);
      try {
        const data = await apiRequest<BusinessInsightsSchema>(
          `/business-insights/${datasetId}/schema?source=${encodeURIComponent(source)}`,
          { method: "GET" }
        );
        if (cancelled) return;
        setSchema(data);
        if (data.saved_business_insights) setResult(data.saved_business_insights);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to inspect dataset");
      } finally {
        if (!cancelled) setLoadingSchema(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [datasetId, source]);

  const analysisReady = !!schema?.analysis_ready;
  const hasGeneratedInsights = !!result;
  const canRun = !!datasetId && analysisReady && !loadingSchema && (schema?.row_count ?? 0) > 0;

  async function onRun() {
    if (!datasetId || !canRun) return;
    setRunning(true);
    try {
      const data = await apiRequest<BusinessInsightsResult>(`/business-insights/${datasetId}/run`, {
        method: "POST",
        timeout: 120000,
        body: {
          source: mode === "simple" ? "latest" : source,
        },
      });
      setResult(data);
      toast.success("Business insights generated and saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Business insights failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold">Business Insights</h2>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Build a business dashboard-style EDA view with charts, quality signals, segment comparisons, and decision-focused insights.
          </p>
        </div>
        {datasetId ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-foreground/70 break-all text-right max-w-xs">Dataset: <DatasetNameDisplay datasetId={datasetId} /></p>
          </div>
        ) : null}
      </div>

      <Card className="relative overflow-visible">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2"><PieChart className="h-4 w-4" /> Insight setup</CardTitle>
              <CardDescription className="mt-1">
                Run Analyze first, then generate dashboard-ready business insights from the cleaned or latest available data.
              </CardDescription>
            </div>
            <div className="inline-flex rounded-lg border border-black/10 p-1 dark:border-white/10">
              <ModeButton value="simple" mode={mode} setMode={setMode}>Simple</ModeButton>
              <ModeButton value="advanced" mode={mode} setMode={setMode}>Advanced</ModeButton>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-visible">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="text-sm font-medium">Use clean data</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                Cleaned data produces clearer charts because empty values, duplicate rows, and messy formats are easier to interpret.
              </p>
              {datasetId ? (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId)}`}>Clean data first</Link>
                </Button>
              ) : null}
            </div>
            <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-medium">Dashboard charts</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                The app chooses useful charts based on the columns it finds: missing data, categories, numeric metrics, timelines, and relationships.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">Decision support</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                Insights explain what the chart or pattern means and how a business team could use it.
              </p>
            </div>
          </div>

          {loadingSchema ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {!analysisReady ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  Run Analyze first so the app can use a verified column profile before generating business insights.
                  {datasetId ? (
                    <Button asChild variant="outline" size="sm" className="ml-0 mt-3 sm:ml-3 sm:mt-0">
                      <Link href={`/dashboard/analyzer?datasetId=${encodeURIComponent(datasetId)}`}>Analyze dataset</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {mode === "advanced" ? (
                <div className="max-w-md space-y-2">
                  <p className="text-sm font-medium">Data source</p>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">Latest available</SelectItem>
                      <SelectItem value="cleaned">Cleaned data</SelectItem>
                      <SelectItem value="engineered">Engineered data</SelectItem>
                      <SelectItem value="raw">Raw upload</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-foreground/55">
                    Latest available uses engineered data first, then cleaned data, then raw upload.
                  </p>
                </div>
              ) : (
                <p className="max-w-2xl text-xs leading-relaxed text-foreground/60">
                  Simple mode automatically uses the latest available version of your dataset and selects useful dashboard charts for you.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={onRun} disabled={!canRun || running}>
                    {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {running ? "Generating insights..." : hasGeneratedInsights ? "Generate insights again" : "Generate insights"}
                  </Button>
                  {hasGeneratedInsights && !running ? (
                    <p className="text-xs text-foreground/60">Running again will replace the latest saved business insights.</p>
                  ) : null}
                </div>
                <PdfReportButton
                  datasetId={datasetId}
                  label="Download insights report"
                  sections="business_insights"
                  className="ml-auto"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result ? (
        <>
          {result.warnings.length ? (
            <Card className="border-amber-500/25 bg-amber-500/5">
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Insight warnings</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.warnings.map((w) => <p key={w} className="text-sm text-foreground/75">{w}</p>)}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Rows reviewed" value={result.row_count.toLocaleString()} hint="Total records scanned for charts and insights." />
            <MetricTile label="Columns reviewed" value={result.column_count.toLocaleString()} hint="Fields available for quality checks and segmentation." />
            <MetricTile label="Missing cells" value={`${result.missing_cells_percent.toFixed(1)}%`} hint="Lower missingness usually means cleaner decisions." />
            <MetricTile label="Duplicate rows" value={result.duplicate_rows.toLocaleString()} hint="Duplicates can inflate counts, totals, or activity." />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Business dashboard charts</CardTitle>
              <CardDescription>
                Generated from the dataset structure. Last generated {fmtDate(result.generated_at)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {result.charts.map((chart) => (
                <div key={chart.title} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                  <SimpleBarChart
                    title={chart.title}
                    description={chart.description}
                    items={chart.items}
                    valueSuffix={chart.value_suffix ?? ""}
                    maxItems={10}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Business insights</CardTitle>
              <CardDescription>Plain recommendations and patterns that can support business decisions.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {result.insights.slice(0, 12).map((insight) => (
                <div key={`${insight.title}-${insight.summary}`} className="rounded-lg border border-black/10 p-4 space-y-2 dark:border-white/10">
                  <p className="text-sm font-semibold">{insight.title}</p>
                  <p className="text-sm text-foreground/85">{insight.summary}</p>
                  <p className="text-xs text-foreground/60 leading-relaxed">{insight.reasoning}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-sm text-foreground/65">
            Generate business insights to see dashboard charts, quality warnings, and decision-focused recommendations.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
