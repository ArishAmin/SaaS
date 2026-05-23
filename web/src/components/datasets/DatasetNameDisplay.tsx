"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Props = { datasetId: string };

export function DatasetNameDisplay({ datasetId }: Props) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let mounted = true;
    apiRequest<{ original_file_name: string }>(`/datasets/${datasetId}`)
      .then((res) => {
        if (mounted) setName(res.original_file_name || datasetId);
      })
      .catch(() => {
        if (mounted) setName(datasetId); // fallback
      });
    return () => {
      mounted = false;
    };
  }, [datasetId]);

  if (!name) return <span className="animate-pulse bg-foreground/10 rounded w-24 h-4 inline-block align-middle"></span>;
  return <span className="font-medium text-foreground">{name}</span>;
}
