"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarClock, LineChart, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasetNameDisplay } from "@/components/datasets/DatasetNameDisplay";
import { PdfReportButton } from "@/components/reports/PdfReportButton";
import { apiRequest } from "@/lib/api";

type SchemaColumn = { column: string; valid_ratio: number; valid_rows: number };
type ForecastPoint = { date: string; predicted: number; lower: number; upper: number };
type ActualPoint = { date: string; value: number };
type ForecastInsight = { title: string; summary: string; reasoning: string };

type ForecastResult = {
  dataset_id: string;
  source: string;
  generated_at: string;
  date_column: string;
  target_column: string;
  frequency: string;
  aggregation: string;
  horizon: number;
  model: string;
  history_periods: number;
  metrics: { mae?: number | null; mape?: number | null; backtest_periods?: number | null };
  warnings: string[];
  actual: ActualPoint[];
  forecast: ForecastPoint[];
  insights: ForecastInsight[];
};

type ForecastSchema = {
  date_columns: SchemaColumn[];
  numeric_columns: SchemaColumn[];
  saved_forecast?: ForecastResult | null;
  forecasted_at?: string | null;
};

function fmtNum(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 2 }).format(v);
}

function fmtDate(v?: string | null) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function ForecastChart({ result }: { result: ForecastResult }) {
  const points = useMemo(() => {
    const actual = result.actual.slice(-60).map((p) => ({ date: p.date, value: p.value, kind: "actual" as const }));
    const forecast = result.forecast.map((p) => ({ date: p.date, value: p.predicted, kind: "forecast" as const }));
    const all = [...actual, ...forecast];
    const values = [
      ...all.map((p) => p.value),
      ...result.forecast.flatMap((p) => [p.lower, p.upper]),
    ].filter((v) => Number.isFinite(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return {
      all,
      min,
      max,
      span,
      actualCount: actual.length,
    };
  }, [result]);

  const width = 760;
  const height = 260;
  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const total = Math.max(points.all.length - 1, 1);
  const xy = (idx: number, value: number) => {
    const x = pad + (idx / total) * innerW;
    const y = pad + (1 - (value - points.min) / points.span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const actualLine = points.all
    .slice(0, points.actualCount)
    .map((p, idx) => xy(idx, p.value))
    .join(" ");
  const forecastLine = points.all
    .slice(Math.max(points.actualCount - 1, 0))
    .map((p, idx) => xy(idx + Math.max(points.actualCount - 1, 0), p.value))
    .join(" ");

  const bandTop = result.forecast
    .map((p, idx) => xy(idx + points.actualCount, p.upper))
    .join(" ");
  const bandBottom = result.forecast
    .slice()
    .reverse()
    .map((p, idx) => xy(points.actualCount + result.forecast.length - 1 - idx, p.lower))
    .join(" ");

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-zinc-950/60 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full h-auto" role="img" aria-label="Forecast chart">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" opacity="0.18" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" opacity="0.18" />
        {bandTop && bandBottom ? (
          <polygon points={`${bandTop} ${bandBottom}`} fill="rgb(59 130 246)" opacity="0.12" />
        ) : null}
        <polyline points={actualLine} fill="none" stroke="rgb(16 185 129)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={forecastLine} fill="none" stroke="rgb(59 130 246)" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />
        <text x={pad} y={18} className="fill-current text-[11px]">
          {fmtNum(points.max)}
        </text>
        <text x={pad} y={height - 6} className="fill-current text-[11px]">
          {fmtNum(points.min)}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-foreground/70">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-6 rounded bg-emerald-500" /> Actual history</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-6 rounded bg-blue-500" /> Forecast</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-6 rounded bg-blue-500/20" /> Planning range</span>
      </div>
    </div>
  );
}

export function ForecastingCard({ datasetId }: { datasetId?: string }) {
  const [schema, setSchema] = useState<ForecastSchema | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [running, setRunning] = useState(false);
  const [dateColumn, setDateColumn] = useState("");
  const [targetColumn, setTargetColumn] = useState("");
  const [frequency, setFrequency] = useState("auto");
  const [aggregation, setAggregation] = useState("sum");
  const [source, setSource] = useState("raw");
  const [horizon, setHorizon] = useState(30);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    async function load() {
      setLoadingSchema(true);
      try {
        const data = await apiRequest<ForecastSchema>(
          `/forecasting/${datasetId}/schema?source=${encodeURIComponent(source)}`,
          { method: "GET" }
        );
        if (cancelled) return;
        setSchema(data);
        if (data.saved_forecast) setResult(data.saved_forecast);
        const firstDate = data.date_columns[0]?.column ?? "";
        const firstNumeric = data.numeric_columns.find((c) => c.column !== firstDate)?.column ?? data.numeric_columns[0]?.column ?? "";
        setDateColumn((prev) => prev || firstDate);
        setTargetColumn((prev) => prev || firstNumeric);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to inspect dataset columns");
      } finally {
        if (!cancelled) setLoadingSchema(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [datasetId, source]);

  async function onRun() {
    if (!datasetId || !dateColumn || !targetColumn) return;
    setRunning(true);
    try {
      const data = await apiRequest<ForecastResult>(`/forecasting/${datasetId}/run`, {
        method: "POST",
        timeout: 120000,
        body: {
          date_column: dateColumn,
          target_column: targetColumn,
          horizon,
          frequency,
          aggregation,
          source,
        },
      });
      setResult(data);
      toast.success("Forecast generated and saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Forecast failed");
    } finally {
      setRunning(false);
    }
  }

  const canRun = !!datasetId && !!dateColumn && !!targetColumn && dateColumn !== targetColumn;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold">Forecasting</h2>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Project a business metric forward from a dated history. Choose a date, a numeric value, and a planning horizon.
          </p>
        </div>
        {datasetId ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-foreground/70 break-all text-right max-w-xs">Dataset: <DatasetNameDisplay datasetId={datasetId} /></p>
            <PdfReportButton datasetId={datasetId} label="PDF report" sections="forecasting" />
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Forecast setup</CardTitle>
          <CardDescription>Use raw data when your original date column is important. Use cleaned data if your source needed preparation first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSchema ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Data source</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw">Raw upload</SelectItem>
                      <SelectItem value="cleaned">Cleaned data</SelectItem>
                      <SelectItem value="engineered">Engineered data</SelectItem>
                      <SelectItem value="latest">Latest available</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date column</Label>
                  <Select value={dateColumn} onValueChange={setDateColumn}>
                    <SelectTrigger><SelectValue placeholder="Choose date column" /></SelectTrigger>
                    <SelectContent>
                      {(schema?.date_columns ?? []).map((c) => (
                        <SelectItem key={c.column} value={c.column}>{c.column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Value to forecast</Label>
                  <Select value={targetColumn} onValueChange={setTargetColumn}>
                    <SelectTrigger><SelectValue placeholder="Choose numeric column" /></SelectTrigger>
                    <SelectContent>
                      {(schema?.numeric_columns ?? []).map((c) => (
                        <SelectItem key={c.column} value={c.column}>{c.column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timeline</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto detect</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>When dates repeat</Label>
                  <Select value={aggregation} onValueChange={setAggregation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sum">Add values together</SelectItem>
                      <SelectItem value="average">Use the average</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Future periods</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={horizon}
                    onChange={(e) => setHorizon(Number(e.target.value))}
                  />
                </div>
              </div>

              {schema && schema.date_columns.length === 0 ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  No reliable date column was detected. Forecasting needs a column like date, month, invoice_date, or created_at.
                </div>
              ) : null}
              {schema && schema.numeric_columns.length === 0 ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  No reliable numeric value column was detected. Forecasting needs a measurable field such as revenue, sales, quantity, cost, or usage.
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={onRun} disabled={!canRun || running}>
                  {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  {running ? "Generating forecast..." : "Generate forecast"}
                </Button>
                <p className="text-xs text-foreground/60">Costs 5 credits. The result is saved into reports after it finishes.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result ? (
        <>
          {result.warnings.length ? (
            <Card className="border-amber-500/25 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Forecast warnings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.warnings.map((w) => <p key={w} className="text-sm text-foreground/75">{w}</p>)}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LineChart className="h-4 w-4" /> Forecast result</CardTitle>
              <CardDescription>
                {result.target_column} forecasted {result.horizon} {result.frequency} periods ahead. Last generated {fmtDate(result.generated_at)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                  <p className="text-xs text-foreground/60">History used</p>
                  <p className="text-xl font-semibold">{result.history_periods}</p>
                </div>
                <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                  <p className="text-xs text-foreground/60">Timeline</p>
                  <p className="text-xl font-semibold capitalize">{result.frequency}</p>
                </div>
                <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                  <p className="text-xs text-foreground/60">Back-test error</p>
                  <p className="text-xl font-semibold">{result.metrics.mape != null ? `${fmtNum(result.metrics.mape)}%` : "-"}</p>
                </div>
                <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                  <p className="text-xs text-foreground/60">Method</p>
                  <p className="text-xl font-semibold capitalize">{result.model}</p>
                </div>
              </div>
              <ForecastChart result={result} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Business insights</CardTitle>
              <CardDescription>Plain-English interpretation of the forecast and the history behind it.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {result.insights.slice(0, 7).map((insight) => (
                <div key={insight.title} className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-2">
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
            Choose the forecasting columns and run a forecast to see the chart, warnings, and business insights.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
