import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["use-cases/data-analysts"];

export const metadata = createMetadata({
  title: "Data Preparation and Analysis for Data Analysts",
  description:
    "Profile, clean, explore, forecast, compare models, and export tabular datasets from one connected workspace built for practical analyst workflows.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
