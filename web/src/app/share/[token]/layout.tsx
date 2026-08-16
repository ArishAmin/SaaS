import type { ReactNode } from "react";

import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Shared Report",
  description: "A privately shared Acutize report.",
  path: "/share",
  noIndex: true,
});

export default function SharedReportLayout({ children }: { children: ReactNode }) {
  return children;
}
