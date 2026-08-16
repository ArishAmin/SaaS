import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["data-quality-analysis"];

export const metadata = createMetadata({
  title: "Dataset Quality Analysis and Profiling",
  description:
    "Assess dataset schema, missing values, duplicates, uniqueness, distributions, and other quality signals before cleaning, reporting, forecasting, or modeling.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
