import { redirect } from "next/navigation";

import { LandingPage } from "@/components/marketing/LandingPage";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createMetadata, serializeJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = createMetadata({
  title: "AI Data Cleaning and Analysis Software",
  description:
    "Clean CSV, Excel, JSON, and Parquet datasets, analyze data quality, generate business insights, compare ML models, forecast metrics, and export reports without writing scripts.",
  path: "/",
});

export const dynamic = "force-dynamic";

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Acutize",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Data preparation and analytics software",
  operatingSystem: "Web browser",
  description:
    "A browser-based workspace for cleaning, analyzing, forecasting, and preparing tabular datasets for machine learning.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free plan available",
  },
};

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareJsonLd) }}
      />
      <LandingPage />
    </>
  );
}
