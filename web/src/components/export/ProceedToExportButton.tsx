"use client";

import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ProceedToExportButton({
  datasetId,
  variant = "outline",
  className,
}: {
  datasetId?: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const href = datasetId
    ? `/dashboard/export?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/export";

  return (
    <Button variant={variant} size="sm" asChild className={`gap-2 ${className ?? ""}`}>
      <Link href={href}>
        <Download className="h-4 w-4" />
        Proceed to export
      </Link>
    </Button>
  );
}
