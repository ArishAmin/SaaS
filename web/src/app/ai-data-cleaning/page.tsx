import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["ai-data-cleaning"];

export const metadata = createMetadata({
  title: "AI Data Cleaning Tool for Business Datasets",
  description:
    "Clean CSV, Excel, JSON, and Parquet datasets with guided profiling, missing-value handling, encoding, scaling, quality review, and downloadable outputs.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
