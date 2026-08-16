import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["no-code-machine-learning"];

export const metadata = createMetadata({
  title: "No-Code Machine Learning for Tabular Data",
  description:
    "Prepare tabular data, generate model ideas, compare classification or regression candidates, review metrics, and export training scripts without boilerplate.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
