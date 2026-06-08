"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, CalendarClock, Download, Lightbulb, Sparkles, Trash2, Wand2, Brain } from "lucide-react";

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
  quick_trained_at?: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function DatasetsTable() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DatasetRow[]>([]);

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

    // Listen to Dataset Upload component completion DOM event
    const handleUpload = () => {
      refresh();
    };
    window.addEventListener("datasetUploaded", handleUpload);
    return () => window.removeEventListener("datasetUploaded", handleUpload);
  }, []);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);

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
            Status, timestamps, and the next actions for each uploaded dataset.
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
          <div className="overflow-auto border border-black/10 dark:border-white/10 rounded-lg">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Updated</th>
                  <th className="text-left p-3">Cleaned</th>
                  <th className="text-left p-3">Engineered</th>
                  <th className="text-left p-3">Trained</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dataset_id} className="border-t border-black/10 dark:border-white/10">
                    <td className="p-3">
                      <p className="font-medium truncate max-w-[280px]">{r.original_file_name}</p>
                      <p className="text-xs text-foreground/70">{r.original_extension.toUpperCase()}</p>
                    </td>
                    <td className="p-3">
                      <span className="text-xs rounded-full px-2 py-1 border border-black/10 dark:border-white/10">
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-foreground/70">{fmtDate(r.updated_at)}</td>
                    <td className="p-3 text-foreground/70">{fmtDate(r.cleaned_at)}</td>
                    <td className="p-3 text-foreground/70">{fmtDate(r.engineered_at)}</td>
                    <td className="p-3 text-foreground/70">{fmtDate(r.quick_trained_at)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/analyzer?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          Analyze
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/cleaning?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          Clean
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/feature-generation?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Engineering
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/recommendation?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          Recommendations
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/training?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <Brain className="h-3.5 w-3.5" />
                          Train Model
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/forecasting?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Forecast
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => (window.location.href = `/dashboard/export?datasetId=${encodeURIComponent(r.dataset_id)}`)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => setDeletingDatasetId(r.dataset_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deletingDatasetId} onOpenChange={(open) => !open && setDeletingDatasetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Dataset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this dataset? This action will permanently remove the dataset and all its related artifacts (cleaning settings, trained models, etc.). This cannot be undone.
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
