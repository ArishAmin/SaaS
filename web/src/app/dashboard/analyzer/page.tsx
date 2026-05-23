import { NoDatasetGate } from "@/components/layout/NoDatasetGate";
import { SectionGuide } from "@/components/layout/SectionGuide";
import { InstantAnalyzerResults } from "@/components/analyzer/InstantAnalyzerResults";

export default async function AnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  const next = datasetId
    ? `/dashboard/cleaning?datasetId=${encodeURIComponent(datasetId)}`
    : "/dashboard/cleaning";
  return (
    <NoDatasetGate
      datasetId={datasetId}
      featureName="Analyze & Explore"
      featureDescription="Profile every column: types, missing values, distributions, and quality scores. Select a dataset from the Data Hub to begin."
    >
      <div className="flex flex-col gap-6">
        <SectionGuide
          title="Analyze & explore"
          subtitle="Understand your data before modeling. Profiles run automatically when you open this page with a dataset selected."
          datasetId={datasetId}
          steps={[
            { title: "Column profile", detail: "Types, missing %, and uniqueness per column." },
            { title: "Quality & charts", detail: "Dataset score plus visual summaries of key columns." },
            { title: "Decide next step", detail: "Use insights to configure cleaning or feature ideas." },
          ]}
          next={{ label: "Clean & encode", href: next }}
        />
        <InstantAnalyzerResults datasetId={datasetId} />
      </div>
    </NoDatasetGate>
  );
}
