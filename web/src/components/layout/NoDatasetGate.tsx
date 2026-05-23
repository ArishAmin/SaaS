"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface NoDatasetGateProps {
  featureName: string;
  featureDescription: string;
  children: React.ReactNode;
  datasetId?: string;
}

/**
 * Gate wrapper — when no datasetId is present, shows a clear
 * disclaimer guiding users to pick a dataset from the Data Hub.
 * When a datasetId IS present the children render normally.
 */
export function NoDatasetGate({
  featureName,
  featureDescription,
  children,
  datasetId,
}: NoDatasetGateProps) {
  if (datasetId) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-6 items-center justify-center min-h-[60vh] text-center max-w-lg mx-auto py-16">
      <div className="w-16 h-16 rounded-2xl bg-foreground/8 flex items-center justify-center">
        <LayoutGrid className="w-8 h-8 text-foreground/40" />
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">{featureName}</h2>
        <p className="text-foreground/65 mt-2 leading-relaxed">{featureDescription}</p>
      </div>

      <Card className="w-full text-left border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40">
        <CardContent className="p-5">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            No dataset selected
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
            This page requires a dataset to work with. Please go to the <strong>Data Hub</strong> on
            the Overview page, select one of your datasets, and use the action button for this
            feature — all your tools will automatically connect to the right file.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap justify-center">
        <Button asChild>
          <Link href="/dashboard">
            <LayoutGrid className="w-4 h-4 mr-2" />
            Go to Data Hub
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/datasets">Upload a new dataset</Link>
        </Button>
      </div>
    </div>
  );
}
