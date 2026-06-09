"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Brain, CalendarClock, Download, Lightbulb, PieChart, Sparkles, Trash2, Wand2 } from "lucide-react";

import { apiRequest } from "@/lib/api";
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

type DatasetRow = {
  dataset_id: string;
  original_file_name: string;
  original_extension: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  cleaned_at?: string | null;
  engineered_at?: string | null;
  business_insights_at?: string | null;
  quick_trained_at?: string | null;
  forecasted_at?: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function latestActivity(row: DatasetRow) {
  const activities = [
    { label: "Uploaded", at: row.created_at },
    { label: "Cleaned", at: row.cleaned_at },
    { label: "Engineered", at: row.engineered_at },
    { label: "Business insights", at: row.business_insights_at },
    { label: "Trained", at: row.quick_trained_at },
    { label: "Forecasted", at: row.forecasted_at },
  ]
    .map((item) => ({ ...item, time: item.at ? new Date(item.at).getTime() : 0 }))
    .filter((item) => item.time && !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);
  return activities[0] ?? { label: "Uploaded", at: row.created_at };
}

function ActionButton({
  label,
  icon: Icon,
  href,
  variant = "secondary",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  variant?: "secondary" | "outline";
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      className="h-8 gap-1.5 px-2.5"
      onClick={() => {
        window.location.href = href;
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function DatasetActions({ row }: { row: DatasetRow }) {
  const id = encodeURIComponent(row.dataset_id);
  return (
    <div className="flex justify-end gap-1.5 flex-wrap">
      <ActionButton label="Analyze" icon={BarChart3} href={`/dashboard/analyzer?datasetId=${id}`} />
      <ActionButton label="Clean" icon={Wand2} href={`/dashboard/cleaning?datasetId=${id}`} />
      <ActionButton label="Insights" icon={PieChart} href={`/dashboard/business-insights?datasetId=${id}`} />
      <ActionButton label="Features" icon={Sparkles} href={`/dashboard/feature-generation?datasetId=${id}`} />
      <ActionButton label="Ideas" icon={Lightbulb} href={`/dashboard/recommendation?datasetId=${id}`} />
      <ActionButton label="Train" icon={Brain} href={`/dashboard/training?datasetId=${id}`} />
      <ActionButton label="Forecast" icon={CalendarClock} href={`/dashboard/forecasting?datasetId=${id}`} />
      <ActionButton label="Export" icon={Download} href={`/dashboard/export?datasetId=${id}`} variant="outline" />
    </div>
  );
}

export function DatasetsTable() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await apiRequest<DatasetRow[]>("/datasets", { method: "GET" });
      setRows(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load datasets";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const handleUpload = () => {
      refresh();
    };
    window.addEventListener("datasetUploaded", handleUpload);
    return () => window.removeEventListener("datasetUploaded", handleUpload);
  }, []);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  async function confirmDelete() {
    if (!deletingDatasetId) return;
    try {
      await apiRequest(`/datasets/${deletingDatasetId}`, { method: "DELETE" });
      toast.success("Dataset deleted.");
      setRows((prev) => prev.filter((r) => r.dataset_id !== deletingDatasetId));
      window.dispatchEvent(new CustomEvent("datasetDeleted"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error(message);
    } finally {
      setDeletingDatasetId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>Your datasets</CardTitle>
          <CardDescription>
            Uploaded files, latest activity, and connected actions for each dataset.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}

        {empty ? (
          <p className="text-sm text-foreground/70">No datasets yet. Upload one above to get started.</p>
        ) : null}

        {!loading && rows.length ? (
          <>
            <div className="grid gap-3 md:hidden">
              {rows.map((r) => {
                const activity = latestActivity(r);
                return (
                  <div key={r.dataset_id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.original_file_name}</p>
                        <p className="text-xs text-foreground/60">
                          {r.original_extension.toUpperCase()} | Uploaded {fmtDate(r.created_at)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-red-600 hover:text-red-700"
                        onClick={() => setDeletingDatasetId(r.dataset_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-3 rounded-md bg-foreground/[0.03] p-2 text-xs text-foreground/65">
                      <span className="font-medium text-foreground/80">{activity.label}</span>
                      <span> | {fmtDate(activity.at)}</span>
                    </div>
                    <div className="mt-3">
                      <DatasetActions row={r} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-auto border border-black/10 dark:border-white/10 rounded-lg">
              <table className="min-w-[780px] w-full text-sm">
                <thead className="bg-black/5 dark:bg-white/5">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Uploaded</th>
                    <th className="text-left p-3">Latest activity</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const activity = latestActivity(r);
                    return (
                      <tr key={r.dataset_id} className="border-t border-black/10 dark:border-white/10 align-top">
                        <td className="p-3">
                          <p className="font-medium truncate max-w-[240px]">{r.original_file_name}</p>
                          <p className="text-xs text-foreground/70">{r.original_extension.toUpperCase()}</p>
                        </td>
                        <td className="p-3 text-foreground/70 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="p-3 text-foreground/70 whitespace-nowrap">
                          <p className="font-medium text-foreground/85">{activity.label}</p>
                          <p className="text-xs">{fmtDate(activity.at)}</p>
                        </td>
                        <td className="p-3">
                          <DatasetActions row={r} />
                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5 text-red-600 hover:text-red-700"
                              onClick={() => setDeletingDatasetId(r.dataset_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </CardContent>

      <Dialog open={!!deletingDatasetId} onOpenChange={(open) => !open && setDeletingDatasetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Dataset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this dataset? This action will permanently remove the dataset and all its related artifacts. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingDatasetId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
