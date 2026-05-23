import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { FreeTierRowLimitBanner } from "@/components/billing/FreeTierRowLimitBanner";
import { CleanDatasetCard } from "@/components/cleaning/CleanDatasetCard";

export default async function CleaningPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  const next = datasetId
    ? `/dashboard/analyzer?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/analyzer";
  return (
    <div className="flex flex-col gap-4">
      <NoDatasetGate
        datasetId={datasetId}
        featureName="Clean & Encode"
        featureDescription="Handle missing values, encode categories, and scale numbers. Select a dataset from the Data Hub to configure and run cleaning."
      >
        <SectionGuide
          title="Clean & encode"
          subtitle="Prepare your raw data for modeling: fill or drop missing values, encode categories, and scale numeric columns."
          datasetId={datasetId}
          steps={[
            { title: "Review columns", detail: "Confirm types and pick a target column for supervised tasks." },
            { title: "Choose strategies", detail: "Set imputation, encoding (one-hot / ordinal), and scaling." },
            { title: "Run cleaning", detail: "Saves a processed copy used by training, features, and export." },
          ]}
          next={{ label: "Analyze & explore", href: next }}
        />
        <FreeTierRowLimitBanner />
        <CleanDatasetCard datasetId={datasetId} />
      </NoDatasetGate>
    </div>
  );
}
