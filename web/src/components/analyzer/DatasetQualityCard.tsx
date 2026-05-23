"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type QualityResponse = {
  dataset_id: string;
  score: number;
  improvements: string[];
  notes: string[];
  avg_missing_percent: number;
  duplicate_ratio: number;
};

export function DatasetQualityCard({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState<QualityResponse | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await apiRequest<QualityResponse>(`/datasets/${datasetId}/quality`, { method: "POST" });
        if (!mounted) return;
        setQuality(res);
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load quality score";
        toast.error(message);
        setQuality(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dataset Quality Score</CardTitle>
          <CardDescription>Scoring your dataset...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!quality) return null;

  const score = Math.max(0, Math.min(100, quality.score));
  const color =
    score >= 80 ? "bg-emerald-600" : score >= 60 ? "bg-blue-600" : score >= 40 ? "bg-amber-500" : "bg-red-600";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dataset Quality Score</CardTitle>
        <CardDescription>0–100 score from missing values, duplicates, and basic hygiene signals.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-2xl font-semibold">{score}</p>
            <p className="text-xs text-foreground/70">Missing: {quality.avg_missing_percent.toFixed(1)}% • Duplicates: {(quality.duplicate_ratio * 100).toFixed(1)}%</p>
          </div>
          <div className="mt-2 h-3 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div className={`${color} h-full`} style={{ width: `${score}%` }} />
          </div>
        </div>

        {quality.improvements?.length ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Improvements needed</p>
            <div className="space-y-2">
              {quality.improvements.slice(0, 4).map((t, idx) => (
                <p key={idx} className="text-sm text-foreground/70">
                  {t}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {quality.notes?.length ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Notes</p>
            <div className="space-y-2">
              {quality.notes.slice(0, 3).map((t, idx) => (
                <p key={idx} className="text-sm text-foreground/70">
                  {t}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

