import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { FreeTierRowLimitBanner } from "@/components/billing/FreeTierRowLimitBanner";
import { FeatureEngineeringCard } from "@/components/feature-engineering/FeatureEngineeringCard";

export default async function FeatureEngineeringPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  const next = datasetId
    ? `/dashboard/training?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/training";
  return (
    <NoDatasetGate
      datasetId={datasetId}
      featureName="Feature selection"
      featureDescription="Drop low-importance columns using tree-based importance on your cleaned dataset."
    >
      <div className="flex flex-col gap-6">
        <SectionGuide
          title="Feature selection"
          subtitle="Reduce noise by removing weak columns before training. Uses decision-tree importance on your cleaned data."
          datasetId={datasetId}
          steps={[
            { title: "Dry run", detail: "Preview which columns would be kept or dropped." },
            { title: "Tune threshold", detail: "Adjust top-k or importance cutoff." },
            { title: "Apply", detail: "Saves a slimmer dataset for modeling." },
          ]}
          next={{ label: "Train models", href: next }}
        />
        <FreeTierRowLimitBanner />
        <FeatureEngineeringCard datasetId={datasetId} />
      </div>
    </NoDatasetGate>
  );
}
