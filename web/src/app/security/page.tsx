import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { createMetadata } from "@/lib/seo";
import { seoPageContent } from "@/lib/seo-page-content";

const content = seoPageContent["security"];

export const metadata = createMetadata({
  title: "Security and Data Handling",
  description:
    "Learn how Acutize approaches authenticated workspace access, account-scoped datasets, report sharing, retention, and manual deletion.",
  path: content.path,
});

export default function Page() {
  return <SeoLandingPage content={content} />;
}
