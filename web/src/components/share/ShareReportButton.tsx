"use client";

import { useState } from "react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function ShareReportButton({ datasetId }: { datasetId?: string }) {
  const [loading, setLoading] = useState(false);

  async function onShare() {
    if (!datasetId) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string }>(`/shared/datasets/${datasetId}`, { method: "POST" });
      const url = `${window.location.origin}/share/${res.token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create share link";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={onShare} disabled={!datasetId || loading}>
      {loading ? "Creating link..." : "Share report"}
    </Button>
  );
}

