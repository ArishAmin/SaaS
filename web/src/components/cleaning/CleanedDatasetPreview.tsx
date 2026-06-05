"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGetBlob } from "@/lib/apiDownload";
import { Skeleton } from "@/components/ui/skeleton";

export function CleanedDatasetPreview({ datasetId }: { datasetId: string }) {
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { blob } = await apiGetBlob(`/datasets/${datasetId}/export/cleaned?format=csv`);
        const text = await blob.text();
        
        if (!mounted) return;
        
        // Simple manual CSV parser for preview
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length > 0) {
          const parsedHeaders = lines[0].split(",");
          // Take next 10 rows for preview
          const parsedRows = lines.slice(1, 11).map(line => line.split(","));
          
          setHeaders(parsedHeaders);
          setRows(parsedRows);
        }
      } catch (err: unknown) {
        if (!mounted) return;
        console.error("Preview load error", err);
        // Silently fail or toast if needed.
        toast.error("Failed to load dataset preview");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [datasetId]);

  if (loading) {
    return (
      <div className="space-y-2 mt-4 p-4 border border-black/10 dark:border-white/10 rounded-lg">
        <p className="text-sm font-medium mb-3">Loading preview...</p>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!headers.length) {
    return null;
  }

  return (
    <div className="mt-4 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden flex flex-col">
      <div className="bg-black/5 dark:bg-white/5 px-4 py-2 border-b border-black/10 dark:border-white/10">
        <p className="text-sm font-medium">Cleaned Dataset Preview (First 10 rows)</p>
      </div>
      <div className="overflow-auto max-h-[350px]">
        <table className="w-full text-xs text-left whitespace-nowrap border-separate border-spacing-0">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-20 bg-zinc-100 px-4 py-2 font-medium shadow-sm shadow-black/10 dark:bg-zinc-900"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-black/10 dark:border-white/10">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
