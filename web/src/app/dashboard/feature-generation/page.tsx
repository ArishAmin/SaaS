import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { FreeTierRowLimitBanner } from "@/components/billing/FreeTierRowLimitBanner";
import { GenerativeFeatureCard } from "@/components/feature-engineering/GenerativeFeatureCard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Generate Features | Acutize",
};

export default async function FeatureGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  const next = datasetId
    ? `/dashboard/recommendation?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/recommendation";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <NoDatasetGate
        datasetId={datasetId}
        featureName="Generate Features"
        featureDescription="Discover new predictive columns from your cleaned data. Select a dataset from the Data Hub to begin."
      >
        <SectionGuide
          title="Generate features"
          subtitle="Click Suggest features when ready, then save your selection and download CSV."
          datasetId={datasetId}
          steps={[
            { title: "Review suggestions", detail: "Each card shows formula, type, and expected impact." },
            { title: "Build your list", detail: "Add or remove features until your selection is final." },
            { title: "Save selection", detail: "Applies features to your dataset and unlocks CSV download." },
          ]}
          next={{ label: "Model ideas", href: next }}
        />
        <FreeTierRowLimitBanner />
        <GenerativeFeatureCard datasetId={datasetId} />
      </NoDatasetGate>
    </div>
  );
}
