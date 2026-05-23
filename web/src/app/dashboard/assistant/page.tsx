import { AssistantChat } from "@/components/assistant/AssistantChat";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ datasetId?: string }>;
}) {
  const { datasetId } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold">Assistant</h2>
        <p className="text-sm text-foreground/70 mt-1 max-w-2xl">
          Ask questions about cleaning, features, models, and metrics. Add your dataset ID for answers grounded in
          your stored analysis and evaluation. The API must have{" "}
          <code className="text-xs rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">OPENAI_API_KEY</code> set to
          enable replies.
        </p>
      </div>
      <AssistantChat initialDatasetId={datasetId} />
    </div>
  );
}

