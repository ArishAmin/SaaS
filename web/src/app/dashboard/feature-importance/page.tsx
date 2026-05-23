import { FeatureImportanceCard } from "@/components/feature-importance/FeatureImportanceCard";

export default async function FeatureImportancePage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">Feature Importance</h2>
        <p className="text-foreground/70 mt-1 text-sm">
          Which features the quick-training decision tree used most (requires a completed quick train).
        </p>
      </div>
      <FeatureImportanceCard datasetId={datasetId} />
    </div>
  );
}

