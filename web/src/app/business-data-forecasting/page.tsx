import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["business-data-forecasting"];

export const metadata = createMetadata({
  title: "Business Data Forecasting from CSV and Excel",
  description:
    "Configure an initial forecast from time-based CSV or Excel data with explicit date, metric, aggregation, and horizon settings.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
