import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["use-cases/operations-teams"];

export const metadata = createMetadata({
  title: "Data Cleaning and Analysis for Operations Teams",
  description:
    "Turn recurring operational CSV and spreadsheet exports into cleaner datasets, reviewable insights, forecasts, reports, and downloadable outputs.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
