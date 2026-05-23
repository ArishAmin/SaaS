import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { QuickEvaluationView } from "@/components/evaluation/QuickEvaluationView";

export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  const trainHref = datasetId
    ? `/dashboard/training?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/training";
  const exportHref = datasetId
    ? `/dashboard/export?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/export";
  return (
    <div className="flex flex-col gap-4">
      <NoDatasetGate
        datasetId={datasetId}
        featureName="Model comparison"
        featureDescription="Deep dive into instant preview results: metric charts, per-model cards, feature importance, PDF and share. Run instant preview on Train models first."
      >
        <SectionGuide
          title="Model comparison"
          subtitle="Detailed view of your last instant preview — how each algorithm scored, visual comparisons, and explainability. This page does not train models; it reads saved preview results."
          datasetId={datasetId}
          steps={[
            { title: "Run preview first", detail: "On Train models, click Run instant preview (required once per refresh)." },
            { title: "Compare metrics", detail: "Bar charts and per-model breakdowns for accuracy, F1, R², etc." },
            { title: "Share or export", detail: "PDF report, share link, or download files from Export." },
          ]}
          next={{ label: "Export & reports", href: exportHref }}
        />
        <QuickEvaluationView datasetId={datasetId} trainHref={trainHref} />
      </NoDatasetGate>
    </div>
  );
}
