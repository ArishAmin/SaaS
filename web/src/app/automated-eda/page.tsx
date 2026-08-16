import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["automated-eda"];

export const metadata = createMetadata({
  title: "Automated Exploratory Data Analysis",
  description:
    "Explore CSV, Excel, JSON, and Parquet datasets with profiling, charts, descriptive summaries, and business-friendly insights in a guided workspace.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
