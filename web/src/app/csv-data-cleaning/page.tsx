import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["csv-data-cleaning"];

export const metadata = createMetadata({
  title: "CSV Data Cleaning and Analysis Online",
  description:
    "Clean and analyze CSV files online. Review schema, missing values, duplicates, data types, charts, and exportable outputs without writing scripts.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
