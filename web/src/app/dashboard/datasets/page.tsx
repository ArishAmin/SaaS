import { DatasetUploadCard } from "@/components/datasets/DatasetUploadCard";
import { DatasetsTable } from "@/components/datasets/DatasetsTable";

export default function DatasetsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Datasets</h2>
          <p className="text-foreground/70 mt-1 text-sm max-w-2xl">
            Step 1 of the pipeline: each upload gets a dataset ID. Use that same ID on Analyze, Clean, Train, and
            Export so everything stays one connected project.
          </p>
        </div>
      </div>

      <DatasetUploadCard />

      <DatasetsTable />
    </div>
  );
}

