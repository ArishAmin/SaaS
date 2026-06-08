import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { ForecastingCard } from "@/components/forecasting/ForecastingCard";

export default async function ForecastingPage({
  searchParams,
}: {
  searchParams?: Promise<{ datasetId?: string }>;
}) {
  const params = await searchParams;
  const datasetId = params?.datasetId;

  return (
    <NoDatasetGate
      datasetId={datasetId}
      featureName="Forecasting"
      featureDescription="Forecast revenue, sales, demand, usage, or other dated business metrics from your uploaded dataset."
    >
      <ForecastingCard datasetId={datasetId} />
    </NoDatasetGate>
  );
}
