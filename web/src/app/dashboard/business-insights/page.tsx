import { BusinessInsightsCard } from "@/components/business-insights/BusinessInsightsCard";
import { NoDatasetGate } from "@/components/layout/NoDatasetGate";

export default async function BusinessInsightsPage({
  searchParams,
}: {
  searchParams?: Promise<{ datasetId?: string }>;
}) {
  const params = await searchParams;
  const datasetId = params?.datasetId;

  return (
    <NoDatasetGate
      datasetId={datasetId}
      featureName="Business Insights"
      featureDescription="Create dashboard-style EDA charts and business-friendly recommendations from your uploaded dataset."
    >
      <BusinessInsightsCard datasetId={datasetId} />
    </NoDatasetGate>
  );
}
