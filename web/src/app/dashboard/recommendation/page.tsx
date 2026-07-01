import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { ModelRecommendationCard } from "@/components/recommendation/ModelRecommendationCard";

export default async function RecommendationPage({
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
      featureName="Model Ideas"
      featureDescription="Algorithm suggestions for your target (not new CSV columns). Click Get model ideas to run—opening this page is free."
    >
      <div className="flex flex-col gap-6">
        <SectionGuide
          title="Model ideas"
          subtitle="Heuristic recommendations based on your target column, missingness, and task type — use this before running an model training."
          datasetId={datasetId}
          steps={[
            { title: "Task detection", detail: "Classification vs regression from your target column." },
            { title: "Suggested algorithms", detail: "Models ranked with short explanations." },
            { title: "Train next", detail: "Run model training to score algorithms on your actual data." },
          ]}
          next={{ label: "Train models", href: next }}
        />
        <ModelRecommendationCard datasetId={datasetId} />
      </div>
    </NoDatasetGate>
  );
}
