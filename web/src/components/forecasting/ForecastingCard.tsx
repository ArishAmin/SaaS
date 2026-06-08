"use client";

import Link from "next/link";
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

type Mode = "simple" | "advanced";
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
  target_mode?: "value" | "count";
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
  analysis_ready: boolean;
  analyzed_at?: string | null;
  columns: { name: string }[];
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

function ForecastChart({ result }: { result: ForecastResult }) {
  const points = useMemo(() => {
    const actual = result.actual.slice(-80).map((p) => ({ date: p.date, value: p.value }));
    const forecast = result.forecast.map((p) => ({ date: p.date, value: p.predicted }));
    const all = [...actual, ...forecast];
    const values = [...all.map((p) => p.value), ...result.forecast.flatMap((p) => [p.lower, p.upper])].filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { all, min, max, span: max - min || 1, actualCount: actual.length };
  }, [result]);

  const width = 760;
  const height = 260;
  const pad = 28;
  const total = Math.max(points.all.length - 1, 1);
  const xy = (idx: number, value: number) => {
    const x = pad + (idx / total) * (width - pad * 2);
    const y = pad + (1 - (value - points.min) / points.span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const actualLine = points.all.slice(0, points.actualCount).map((p, idx) => xy(idx, p.value)).join(" ");
  const forecastStart = Math.max(points.actualCount - 1, 0);
  const forecastLine = points.all.slice(forecastStart).map((p, idx) => xy(idx + forecastStart, p.value)).join(" ");
  const bandTop = result.forecast.map((p, idx) => xy(idx + points.actualCount, p.upper)).join(" ");
  const bandBottom = result.forecast.slice().reverse().map((p, idx) => xy(points.actualCount + result.forecast.length - 1 - idx, p.lower)).join(" ");

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white/80 p-3 dark:border-white/10 dark:bg-zinc-950/70">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full h-auto" role="img" aria-label="Forecast chart">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" opacity="0.18" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" opacity="0.18" />
        {bandTop && bandBottom ? <polygon points={`${bandTop} ${bandBottom}`} fill="rgb(59 130 246)" opacity="0.12" /> : null}
        <polyline points={actualLine} fill="none" stroke="rgb(16 185 129)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={forecastLine} fill="none" stroke="rgb(59 130 246)" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />
        <text x={pad} y={18} className="fill-current text-[11px]">{fmtNum(points.max)}</text>
        <text x={pad} y={height - 6} className="fill-current text-[11px]">{fmtNum(points.min)}</text>
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
  const [mode, setMode] = useState<Mode>("simple");
  const [schema, setSchema] = useState<ForecastSchema | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [running, setRunning] = useState(false);
  const [dateColumn, setDateColumn] = useState("");
  const [targetColumn, setTargetColumn] = useState("");
  const [frequency, setFrequency] = useState("auto");
  const [aggregation, setAggregation] = useState("sum");
  const [source, setSource] = useState("latest");
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
        const firstDate = data.date_columns.find((c) => c.valid_rows > 0)?.column ?? data.columns[0]?.name ?? "";
        const firstTarget = data.columns.find((c) => c.name !== firstDate)?.name ?? data.columns[0]?.name ?? "";
        setDateColumn(firstDate);
        setTargetColumn((prev) => (prev && data.columns.some((c) => c.name === prev) ? prev : firstTarget));
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

  const dateOptions = useMemo(() => schema?.date_columns ?? [], [schema]);
  const targetOptions = useMemo(
    () => (schema?.columns ?? []).filter((c) => c.name !== dateColumn),
    [schema, dateColumn]
  );
  const hasDateColumn = dateOptions.length > 0;
  const hasTargetColumn = targetOptions.length > 0;
  const analysisReady = !!schema?.analysis_ready;
  const selectedDateColumn = dateColumn;
  const selectedDateProfile = dateOptions.find((c) => c.column === selectedDateColumn);
  const canRun = !!datasetId && analysisReady && hasDateColumn && hasTargetColumn && !!selectedDateColumn && !!targetColumn && selectedDateColumn !== targetColumn;

  useEffect(() => {
    if (!schema) return;
    if (targetColumn && targetOptions.some((c) => c.name === targetColumn)) return;
    setTargetColumn(targetOptions[0]?.name ?? "");
  }, [schema, dateColumn, targetColumn, targetOptions]);

  async function onRun() {
    if (!datasetId || !canRun) return;
    setRunning(true);
    try {
      const data = await apiRequest<ForecastResult>(`/forecasting/${datasetId}/run`, {
        method: "POST",
        timeout: 120000,
        body: {
          date_column: selectedDateColumn,
          target_column: targetColumn,
          horizon,
          frequency: mode === "simple" ? "auto" : frequency,
          aggregation: mode === "simple" ? "sum" : aggregation,
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold">Forecasting</h2>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Forecast a dated business metric such as revenue, sales, demand, usage, cost, or inventory.
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
              <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Forecast setup</CardTitle>
              <CardDescription className="mt-1">
                Run Analyze first, then forecast from the cleaned or latest available version when possible.
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
                Cleaned data gives steadier forecasts because missing values, duplicate rows, and messy number formats are handled first.
              </p>
              {datasetId ? (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId)}`}>Clean data first</Link>
                </Button>
              ) : null}
            </div>
            <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-sm font-medium">Choose the timeline</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                Select the column that contains the date, month, timestamp, or period for each row. The column name can be anything.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">Planning estimate</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/65">
                Forecasts are business planning estimates. Use the result with your market, inventory, sales, or operations context.
              </p>
            </div>
          </div>

          {loadingSchema ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {!analysisReady ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  Run Analyze first so the app can verify the column profile before forecasting.
                  {datasetId ? (
                    <Button asChild variant="outline" size="sm" className="ml-0 mt-3 sm:ml-3 sm:mt-0">
                      <Link href={`/dashboard/analyzer?datasetId=${encodeURIComponent(datasetId)}`}>Analyze dataset</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {!hasTargetColumn ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                  Choose a target column different from the timeline. Numeric targets forecast the value; text or category targets forecast activity volume over time.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mode === "advanced" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Data source</Label>
                      <Select value={source} onValueChange={setSource}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="latest">Latest available</SelectItem>
                          <SelectItem value="cleaned">Cleaned data</SelectItem>
                          <SelectItem value="engineered">Engineered data</SelectItem>
                          <SelectItem value="raw">Raw upload</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}

                <div className="space-y-2">
                  <Label>Date or time column</Label>
                  <Select value={dateColumn} onValueChange={setDateColumn} disabled={!hasDateColumn}>
                    <SelectTrigger><SelectValue placeholder="Choose timeline column" /></SelectTrigger>
                    <SelectContent>
                      {dateOptions.map((c) => <SelectItem key={c.column} value={c.column}>{c.column}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedDateProfile?.valid_rows ? (
                    <p className="text-xs text-foreground/55">
                      This column has {selectedDateProfile.valid_rows.toLocaleString()} date-like values ready for forecasting.
                    </p>
                  ) : (
                    <p className="text-xs text-foreground/55">
                      Pick the column that represents the business timeline. The app will read the chosen field when you run the forecast.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Target to forecast</Label>
                  <Select value={targetColumn} onValueChange={setTargetColumn} disabled={!hasTargetColumn}>
                    <SelectTrigger><SelectValue placeholder="Choose target column" /></SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-foreground/55">
                    Numeric targets forecast their value. Text or category targets forecast how much activity appears over time.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Future periods</Label>
                  <Input type="number" min={1} max={1440} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
                  <p className="text-xs text-foreground/55">Example: 30 means the next 30 detected periods.</p>
                </div>

                {mode === "advanced" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Timeline</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto detect</SelectItem>
                          <SelectItem value="minute">Minute</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
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
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={onRun} disabled={!canRun || running}>
                    {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    {running ? "Generating forecast..." : "Generate forecast"}
                  </Button>
                </div>
                <PdfReportButton
                  datasetId={datasetId}
                  label="Download forecast report"
                  sections="forecasting"
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
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Forecast warnings</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.warnings.map((w) => <p key={w} className="text-sm text-foreground/75">{w}</p>)}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LineChart className="h-4 w-4" /> Forecast result</CardTitle>
              <CardDescription>
                {result.target_mode === "count"
                  ? `${result.target_column} activity forecasted ${result.horizon} ${result.frequency} periods ahead.`
                  : `${result.target_column} forecasted ${result.horizon} ${result.frequency} periods ahead.`} Last generated {fmtDate(result.generated_at)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-sm leading-relaxed text-foreground/75">
                The green line shows what already happened. The blue dashed line shows the expected future direction.
                The light blue area is the planning range, so wider shading means the future is less certain.
              </div>
              <ForecastChart result={result} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Business predictions</CardTitle>
              <CardDescription>What the forecast suggests for planning and decision-making.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {result.insights.slice(0, 7).map((insight) => (
                <div key={insight.title} className="rounded-lg border border-black/10 p-4 space-y-2 dark:border-white/10">
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
            Choose a timeline and target column to see the chart, warnings, and business predictions.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
