"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";

import { apiGetBlob } from "@/lib/apiDownload";
import { Button } from "@/components/ui/button";

type Props = {
  datasetId?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
  sections?: string;
};

export function PdfReportButton({
  datasetId,
  variant = "outline",
  size = "default",
  className,
  label = "Download PDF report",
  sections,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    if (!datasetId) {
      toast.error("Select a dataset first.");
      return;
    }
    setLoading(true);
    try {
      const qs = sections ? `?sections=${encodeURIComponent(sections)}` : "";
      const { blob, headers } = await apiGetBlob(`/datasets/${datasetId}/report/pdf${qs}`);
      const cd = headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `acutize-report-${datasetId}.pdf`;
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast.success("PDF report downloaded.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "PDF download failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={onDownload} disabled={!datasetId || loading}>
      <FileDown className="h-4 w-4" />
      {loading ? "Generating PDF..." : label}
    </Button>
  );
}
