import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { QuickTrainingCard } from "@/components/training/QuickTrainingCard";
import { TrainingPlanBanner } from "@/components/training/TrainingPlanBanner";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <NoDatasetGate
        datasetId={datasetId}
        featureName="Train Models"
        featureDescription="Compare machine learning algorithms with a fast instant preview on your dataset. Select a dataset from the Data Hub to begin."
      >
        <SectionGuide
          title="Train models"
          subtitle="Run a quick instant preview to see which algorithms perform best on a sample of your data. Results are saved for deeper analysis in Model comparison."
          datasetId={datasetId}
          steps={[
            {
              title: "Clean first (recommended)",
              detail: "Missing values and encoding from Clean & Encode improve preview quality.",
            },
            {
              title: "Run instant preview",
              detail: "Trains several models on a sample in seconds — nothing runs until you click.",
            },
            {
              title: "Compare in depth",
              detail: "Open Model comparison for charts, feature importance, PDF, and sharing.",
            },
          ]}
          next={
            datasetId
              ? {
                  label: "Model comparison",
                  href: `/dashboard/evaluation?datasetId=${encodeURIComponent(datasetId)}`,
                }
              : { label: "Model comparison", href: "/dashboard/evaluation" }
          }
        />
        <TrainingPlanBanner />
        <QuickTrainingCard datasetId={datasetId} />
      </NoDatasetGate>
    </div>
  );
}
