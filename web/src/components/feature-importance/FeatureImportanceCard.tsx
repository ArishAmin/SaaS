"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type FeatureImportanceRow = { feature: string; importance: number };

type FeatureImportanceResponse = {
  dataset_id: string;
  model_name: string;
  top_features: FeatureImportanceRow[];
};

export function FeatureImportanceCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FeatureImportanceResponse | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setData(null);
      try {
        const res = await apiRequest<FeatureImportanceResponse>(
          `/datasets/${datasetId}/feature-importance`,
          { method: "GET" }
        );
        if (!mounted) return;
        setData(res);
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load feature importance";
        toast.error(message);
        setData(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [datasetId]);

  const topFeatures = useMemo(() => data?.top_features ?? [], [data]);
  const maxImp = useMemo(() => (topFeatures.length ? Math.max(...topFeatures.map((t) => t.importance)) : 0), [topFeatures]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feature Importance</CardTitle>
          <CardDescription>Computing top features...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Importance</CardTitle>
        <CardDescription>
          Extracted from Decision Tree importances ({data.model_name}).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {topFeatures.length ? (
          <div className="space-y-3">
            {topFeatures.slice(0, 15).map((f) => {
              const pct = maxImp > 0 ? (f.importance / maxImp) * 100 : 0;
              return (
                <div key={f.feature} className="flex items-center gap-3">
                  <div className="w-1/2 min-w-[160px]">
                    <p className="text-sm font-medium truncate">{f.feature}</p>
                  </div>
                  <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 text-right">
                    <p className="text-xs text-foreground/70">{f.importance.toFixed(4)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-foreground/70">No feature importances available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

