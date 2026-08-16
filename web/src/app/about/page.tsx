import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["about"];

export const metadata = createMetadata({
  title: "About Acutize",
  description:
    "Learn how Acutize helps analysts and operations teams prepare, explore, forecast, model, and export structured business datasets.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
