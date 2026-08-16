import type { ReactNode } from "react";

import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Pricing for Data Cleaning and Analysis",
  description:
    "Compare Acutize plans for cleaning, analyzing, forecasting, modeling, and exporting CSV, Excel, JSON, and Parquet datasets.",
  path: "/pricing",
});

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
